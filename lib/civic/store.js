import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ZONES, THRESHOLD } from "./config";
import {
  computeZoneSignals,
  detectAnomalies,
  detectCorrelation,
  computePulse,
} from "./intelligence";

const databasePath =
  process.env.CITYPULSE_DB_PATH || join(process.cwd(), ".data", "citypulse.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath, { timeout: 5000 });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, label TEXT, city TEXT,
    latitude REAL, longitude REAL, radius INTEGER DEFAULT 800,
    boundary TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS civic_events (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, event_type TEXT, title TEXT,
    description TEXT, zone_id TEXT REFERENCES zones(id) ON DELETE CASCADE,
    latitude REAL, longitude REAL, severity TEXT, value REAL, unit TEXT,
    status TEXT DEFAULT 'active', timestamp TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS anomalies (
    id TEXT PRIMARY KEY, zone_id TEXT REFERENCES zones(id) ON DELETE CASCADE,
    event_type TEXT, metric TEXT, baseline_value REAL, current_value REAL,
    change_percent REAL, severity TEXT, detected_at TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS correlations (
    id TEXT PRIMARY KEY, zone_id TEXT REFERENCES zones(id) ON DELETE CASCADE,
    event_a_id TEXT, event_b_id TEXT, correlation_type TEXT, confidence REAL,
    time_overlap REAL, location_overlap REAL, explanation TEXT,
    detected_at TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY, zone_id TEXT REFERENCES zones(id) ON DELETE CASCADE,
    title TEXT, summary TEXT, severity TEXT, confidence REAL, insight_type TEXT,
    source_event_ids TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY, zone_id TEXT REFERENCES zones(id) ON DELETE CASCADE,
    insight_id TEXT, alert_type TEXT, severity TEXT, title TEXT, message TEXT,
    status TEXT DEFAULT 'active', created_at TEXT NOT NULL, resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sim_state (
    id TEXT PRIMARY KEY, step INTEGER NOT NULL DEFAULT 0, base_ts TEXT, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS civic_events_zone_time_idx ON civic_events(zone_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS civic_events_source_idx ON civic_events(source);
  CREATE INDEX IF NOT EXISTS alerts_zone_idx ON alerts(zone_id);
  CREATE INDEX IF NOT EXISTS insights_zone_idx ON insights(zone_id);
`);

const now = () => new Date().toISOString();
function runTransaction(callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("[database.json]", error.message);
    return fallback;
  }
};

function rowToRecord(row) {
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
    ...(row.source_event_ids !== undefined
      ? { source_event_ids: parseJson(row.source_event_ids, []) }
      : {}),
  };
}

export async function ensureZones() {
  const insert = db.prepare(`
    INSERT INTO zones (id, name, label, city, latitude, longitude, radius, created_at)
    VALUES (@id, @name, @label, @city, @latitude, @longitude, @radius, @created_at)
    ON CONFLICT(id) DO NOTHING
  `);
  runTransaction(() => {
    for (const zone of ZONES) insert.run({ ...zone, created_at: now() });
  });
}

export async function getZones() {
  return db.prepare("SELECT * FROM zones ORDER BY label").all();
}

export async function listRecords(table, limit = 100) {
  const orderColumns = {
    civic_events: "timestamp",
    anomalies: "detected_at",
    correlations: "detected_at",
    insights: "created_at",
    alerts: "created_at",
  };
  const orderColumn = orderColumns[table];
  if (!orderColumn) throw new Error("Unsupported record collection");
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY ${orderColumn} DESC LIMIT ?`)
    .all(Math.max(1, Math.min(400, Number(limit) || 100)))
    .map(rowToRecord);
}

export async function getEvent(id) {
  const row = db.prepare("SELECT * FROM civic_events WHERE id = ?").get(id);
  return row ? rowToRecord(row) : null;
}

export async function clearScenarioData() {
  runTransaction(() => {
    for (const table of ["civic_events", "anomalies", "correlations", "insights", "alerts"]) {
      db.exec(`DELETE FROM ${table}`);
    }
  });
}

export async function insertEvents(rows) {
  if (!rows?.length) return;
  const insert = db.prepare(`
    INSERT INTO civic_events
      (id, source, event_type, title, description, zone_id, latitude, longitude,
       severity, value, unit, status, timestamp, metadata, created_at)
    VALUES
      (@id, @source, @event_type, @title, @description, @zone_id, @latitude, @longitude,
       @severity, @value, @unit, @status, @timestamp, @metadata, @created_at)
  `);
  runTransaction(() => {
    for (const event of rows) {
      insert.run({
        id: event.id || randomUUID(),
        source: event.source,
        event_type: event.event_type || null,
        title: event.title || "",
        description: event.description || "",
        zone_id: event.zone_id || null,
        latitude: event.latitude ?? null,
        longitude: event.longitude ?? null,
        severity: event.severity || "low",
        value: event.value ?? null,
        unit: event.unit || null,
        status: event.status || "active",
        timestamp: event.timestamp || now(),
        metadata: JSON.stringify(event.metadata || {}),
        created_at: event.created_at || now(),
      });
    }
  });
}

export async function getSimState() {
  return (
    db.prepare("SELECT * FROM sim_state WHERE id = ?").get("demo") || {
      id: "demo",
      step: 0,
      base_ts: null,
    }
  );
}

export async function setSimState(step, baseTs) {
  db.prepare(`
    INSERT INTO sim_state (id, step, base_ts, updated_at) VALUES ('demo', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET step=excluded.step, base_ts=excluded.base_ts, updated_at=excluded.updated_at
  `).run(step, baseTs || null, now());
}

export async function persistFindings(zone, anomalies, correlation) {
  const insertAnomaly = db.prepare(`
    INSERT INTO anomalies
      (id, zone_id, event_type, metric, baseline_value, current_value, change_percent, severity, detected_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCorrelation = db.prepare(`
    INSERT INTO correlations
      (id, zone_id, event_a_id, event_b_id, correlation_type, confidence,
       time_overlap, location_overlap, explanation, detected_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  runTransaction(() => {
    for (const anomaly of anomalies || []) {
      insertAnomaly.run(
        randomUUID(), zone.id, anomaly.event_type, anomaly.metric,
        anomaly.baseline_value, anomaly.current_value, anomaly.change_percent,
        anomaly.severity, now(), JSON.stringify({ label: anomaly.label }),
      );
    }
    if (correlation) {
      insertCorrelation.run(
        randomUUID(), zone.id, correlation.event_a_id, correlation.event_b_id,
        correlation.correlation_type, correlation.confidence,
        correlation.time_overlap, correlation.location_overlap,
        correlation.explanation, now(),
        JSON.stringify({
          evidence: correlation.evidence,
          factors: correlation.factors,
          window: correlation.window,
        }),
      );
    }
  });
}

export async function createInsightAndAlert(zone, correlation, summary, ai) {
  const insightId = randomUUID();
  const createdAt = now();
  runTransaction(() => {
    db.prepare(`
      INSERT INTO insights
        (id, zone_id, title, summary, severity, confidence, insight_type,
         source_event_ids, metadata, created_at)
      VALUES (?, ?, ?, ?, 'high', ?, 'correlation', ?, ?, ?)
    `).run(
      insightId, zone.id, `Possible weather-related disruption in ${zone.label}`,
      summary, correlation.confidence,
      JSON.stringify([correlation.event_a_id, correlation.event_b_id].filter(Boolean)),
      JSON.stringify({ ai, evidence: correlation.evidence, window: correlation.window }),
      createdAt,
    );
    db.prepare(`
      INSERT INTO alerts
        (id, zone_id, insight_id, alert_type, severity, title, message, status, created_at)
      VALUES (?, ?, ?, 'correlation', 'high', ?, ?, 'active', ?)
    `).run(
      randomUUID(), zone.id, insightId, "Possible traffic disruption",
      `Heavy rainfall coincides with a rise in traffic incidents and transit delays in ${zone.label}.`,
      createdAt,
    );
  });
  return insightId;
}

export async function resolveAlert(id) {
  const result = db.prepare(`
    UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'active'
  `).run(now(), id);
  return result.changes > 0;
}

function feedStatus(events, source) {
  const list = events.filter((event) => event.source === source);
  if (!list.length) return { source, status: "missing", lastUpdated: null, count: 0 };
  const last = list.reduce((latest, event) =>
    new Date(event.timestamp) > new Date(latest.timestamp) ? event : latest,
  );
  const ageMin = (Date.now() - new Date(last.timestamp).getTime()) / 60000;
  return {
    source,
    status: ageMin > THRESHOLD.staleFeedMin ? "stale" : "ok",
    lastUpdated: last.timestamp,
    count: list.length,
  };
}

export async function buildSnapshot() {
  const zones = db.prepare("SELECT * FROM zones ORDER BY label").all();
  const events = db
    .prepare("SELECT * FROM civic_events ORDER BY timestamp DESC LIMIT 400")
    .all()
    .map(rowToRecord)
    .map((event) => ({ ...event, value: event.value == null ? null : Number(event.value) }));
  const insights = db
    .prepare("SELECT * FROM insights ORDER BY created_at DESC LIMIT 50")
    .all()
    .map(rowToRecord);
  const alerts = db
    .prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50")
    .all();
  const sim = await getSimState();
  const activeEvents = events.filter((event) => event.status === "active");

  const zoneViews = zones.map((zone) => {
    const zoneEvents = activeEvents.filter((event) => event.zone_id === zone.id);
    const signals = computeZoneSignals(zone, zoneEvents);
    const anomalies = detectAnomalies(zone, signals);
    const correlation = detectCorrelation(zone, anomalies, zoneEvents, signals);
    const pulse = zoneEvents.length
      ? computePulse(signals)
      : {
          score: null,
          factors: { weather: null, traffic: null, transit: null, incidents: null },
        };
    return { zone, signals, anomalies, correlation, pulse, eventCount: zoneEvents.length };
  });

  const reportingZones = zoneViews.filter((view) => view.eventCount > 0);
  const cityScore = reportingZones.length
    ? Math.round(
        reportingZones.reduce((total, view) => total + view.pulse.score, 0) /
          reportingZones.length,
      )
    : null;
  const cityFactors = ["weather", "traffic", "transit", "incidents"].reduce((result, key) => {
    result[key] = reportingZones.length
      ? Math.round(
          reportingZones.reduce((total, view) => total + view.pulse.factors[key], 0) /
            reportingZones.length,
        )
      : null;
    return result;
  }, {});
  const correlations = zoneViews
    .filter((view) => view.correlation)
    .map((view) => ({
      ...view.correlation,
      zoneLabel: view.zone.label,
      zoneName: view.zone.name,
    }));
  const anomalies = zoneViews.flatMap((view) =>
    view.anomalies.map((anomaly) => ({ ...anomaly, zoneLabel: view.zone.label })),
  );

  return {
    city: { name: zones[0]?.city || "Jaipur", pulse: cityScore, factors: cityFactors },
    zones: zoneViews,
    events,
    anomalies,
    correlations,
    insights,
    alerts,
    feeds: ["weather", "traffic", "transit"].map((source) => feedStatus(events, source)),
    step: sim.step || 0,
    baseTs: sim.base_ts,
    lastUpdated: now(),
  };
}
