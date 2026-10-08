import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { MongoClient } from "mongodb";
import { ZONES, THRESHOLD } from "./config";
import {
  computeZoneSignals,
  detectAnomalies,
  detectCorrelation,
  computePulse,
} from "./intelligence";

const mongoUri = process.env.MONGODB_URI;
const mongoDatabaseName = process.env.MONGODB_DATABASE || "citypulse";
const useMongo = Boolean(mongoUri) || process.env.VERCEL === "1";

export class StorageConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

const databasePath =
  process.env.CITYPULSE_DB_PATH || join(process.cwd(), ".data", "citypulse.sqlite");
let sqlite;
let mongoConnection;
let mongoClient;

const tableNames = {
  civic_events: "civic_events",
  anomalies: "anomalies",
  correlations: "correlations",
  insights: "insights",
  alerts: "alerts",
};
const orderColumns = {
  civic_events: "timestamp",
  anomalies: "detected_at",
  correlations: "detected_at",
  insights: "created_at",
  alerts: "created_at",
};
const now = () => new Date().toISOString();

export function getDatabaseKind() {
  if (!useMongo) return "sqlite";
  return mongoUri ? "mongodb" : "unconfigured";
}

async function getMongoDatabase() {
  if (!mongoUri) {
    throw new StorageConfigurationError(
      "Persistent storage is not configured. Add MONGODB_URI and MONGODB_DATABASE to the Vercel project environment, then redeploy.",
    );
  }
  if (!mongoConnection) {
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });
    mongoClient = client;
    mongoConnection = client
      .connect()
      .then(() => {
        const database = client.db(mongoDatabaseName);
        return initializeMongo(database).then(() => database);
      })
      .catch((error) => {
        mongoConnection = undefined;
        mongoClient = undefined;
        return client.close().then(() => {
          throw error;
        });
      });
  }
  return mongoConnection;
}

async function withMongoTransaction(database, callback) {
  const session = mongoClient.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

async function initializeMongo(database) {
  await Promise.all([
    database.collection("zones").createIndex({ id: 1 }, { unique: true }),
    database.collection("civic_events").createIndex({ timestamp: -1 }),
    database.collection("civic_events").createIndex({ zone_id: 1, timestamp: -1 }),
    database.collection("anomalies").createIndex({ detected_at: -1 }),
    database.collection("correlations").createIndex({ detected_at: -1 }),
    database.collection("insights").createIndex({ created_at: -1 }),
    database.collection("alerts").createIndex({ created_at: -1 }),
  ]);

  const migrationId = "remove-synthetic-demo-data-v1";
  const migrations = database.collection("app_migrations");
  if (await migrations.findOne({ _id: migrationId })) return;
  await withMongoTransaction(database, async (session) => {
    if (await migrations.findOne({ _id: migrationId }, { session })) return;
    await database.collection("civic_events").deleteMany(
      { "metadata.demo": true },
      { session },
    );
    await Promise.all(
      ["anomalies", "correlations", "insights", "alerts"].map((name) =>
        database.collection(name).deleteMany({}, { session }),
      ),
    );
    await database.collection("sim_state").deleteOne({ _id: "demo" }, { session });
    await migrations.insertOne(
      { _id: migrationId, applied_at: now() },
      { session },
    );
  });
}

async function getSqliteDatabase() {
  if (!sqlite) {
    const { DatabaseSync } = await import("node:sqlite");
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
      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY, applied_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS civic_events_zone_time_idx ON civic_events(zone_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS civic_events_source_idx ON civic_events(source);
      CREATE INDEX IF NOT EXISTS alerts_zone_idx ON alerts(zone_id);
      CREATE INDEX IF NOT EXISTS insights_zone_idx ON insights(zone_id);
    `);
    const migrationId = "remove-synthetic-demo-data-v1";
    const applied = db.prepare("SELECT id FROM app_migrations WHERE id = ?").get(migrationId);
    if (!applied) {
      runSqliteTransaction(db, () => {
        db.exec(`DELETE FROM civic_events WHERE metadata LIKE '%"demo":true%'`);
        for (const table of ["anomalies", "correlations", "insights", "alerts"]) {
          db.exec(`DELETE FROM ${table}`);
        }
        db.prepare("DELETE FROM sim_state WHERE id = ?").run("demo");
        db.prepare("INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)").run(
          migrationId,
          now(),
        );
      });
    }
    sqlite = db;
  }
  return sqlite;
}

function runSqliteTransaction(db, callback) {
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

function mongoRecord(row) {
  if (!row) return null;
  const { _id, ...record } = row;
  return record;
}

function normalizeEvent(event) {
  return {
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
    metadata: event.metadata || {},
    created_at: event.created_at || now(),
  };
}

export async function ensureZones() {
  if (useMongo) {
    if (!mongoUri) return;
    const database = await getMongoDatabase();
    const collection = database.collection("zones");
    await collection.bulkWrite(
      ZONES.map((zone) => ({
        updateOne: {
          filter: { id: zone.id },
          update: { $setOnInsert: { ...zone, created_at: now() } },
          upsert: true,
        },
      })),
    );
    return;
  }

  const db = await getSqliteDatabase();
  const insert = db.prepare(`
    INSERT INTO zones (id, name, label, city, latitude, longitude, radius, created_at)
    VALUES (@id, @name, @label, @city, @latitude, @longitude, @radius, @created_at)
    ON CONFLICT(id) DO NOTHING
  `);
  runSqliteTransaction(db, () => {
    for (const zone of ZONES) insert.run({ ...zone, created_at: now() });
  });
}

export async function getZones() {
  if (useMongo) {
    if (!mongoUri) return ZONES;
    const database = await getMongoDatabase();
    return (
      await database.collection("zones").find({}, { projection: { _id: 0 } }).sort({ label: 1 }).toArray()
    );
  }
  const db = await getSqliteDatabase();
  return db.prepare("SELECT * FROM zones ORDER BY label").all();
}

export async function listRecords(table, limit = 100) {
  const collectionName = tableNames[table];
  const orderColumn = orderColumns[table];
  if (!collectionName || !orderColumn) throw new Error("Unsupported record collection");
  const boundedLimit = Math.max(1, Math.min(400, Number(limit) || 100));
  if (useMongo) {
    if (!mongoUri) return [];
    const database = await getMongoDatabase();
    return (
      await database
        .collection(collectionName)
        .find({}, { projection: { _id: 0 } })
        .sort({ [orderColumn]: -1 })
        .limit(boundedLimit)
        .toArray()
    );
  }
  const db = await getSqliteDatabase();
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY ${orderColumn} DESC LIMIT ?`)
    .all(boundedLimit)
    .map(rowToRecord);
}

export async function getEvent(id) {
  if (useMongo) {
    if (!mongoUri) return null;
    const database = await getMongoDatabase();
    return mongoRecord(
      await database.collection("civic_events").findOne({ id }, { projection: { _id: 0 } }),
    );
  }
  const db = await getSqliteDatabase();
  const row = db.prepare("SELECT * FROM civic_events WHERE id = ?").get(id);
  return row ? rowToRecord(row) : null;
}

export async function clearScenarioData() {
  if (useMongo) {
    const database = await getMongoDatabase();
    await withMongoTransaction(
      database,
      (session) =>
        Promise.all(
          Object.values(tableNames).map((name) =>
            database.collection(name).deleteMany({}, { session }),
          ),
        ),
    );
    return;
  }
  const db = await getSqliteDatabase();
  runSqliteTransaction(db, () => {
    for (const table of Object.values(tableNames)) db.exec(`DELETE FROM ${table}`);
  });
}

export async function insertEvents(rows) {
  if (!rows?.length) return;
  const events = rows.map(normalizeEvent);
  if (useMongo) {
    const database = await getMongoDatabase();
    await database.collection("civic_events").insertMany(events);
    return;
  }
  const db = await getSqliteDatabase();
  const insert = db.prepare(`
    INSERT INTO civic_events
      (id, source, event_type, title, description, zone_id, latitude, longitude,
       severity, value, unit, status, timestamp, metadata, created_at)
    VALUES
      (@id, @source, @event_type, @title, @description, @zone_id, @latitude, @longitude,
       @severity, @value, @unit, @status, @timestamp, @metadata, @created_at)
  `);
  runSqliteTransaction(db, () => {
    for (const event of events) {
      insert.run({ ...event, metadata: JSON.stringify(event.metadata) });
    }
  });
}

export async function getSimState() {
  if (useMongo) {
    const database = await getMongoDatabase();
    return (
      mongoRecord(await database.collection("sim_state").findOne({ _id: "demo" })) || {
        id: "demo",
        step: 0,
        base_ts: null,
      }
    );
  }
  const db = await getSqliteDatabase();
  return (
    db.prepare("SELECT * FROM sim_state WHERE id = ?").get("demo") || {
      id: "demo",
      step: 0,
      base_ts: null,
    }
  );
}

export async function setSimState(step, baseTs) {
  if (useMongo) {
    const database = await getMongoDatabase();
    await database.collection("sim_state").updateOne(
      { _id: "demo" },
      { $set: { step, base_ts: baseTs || null, updated_at: now() } },
      { upsert: true },
    );
    return;
  }
  const db = await getSqliteDatabase();
  db.prepare(`
    INSERT INTO sim_state (id, step, base_ts, updated_at) VALUES ('demo', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET step=excluded.step, base_ts=excluded.base_ts, updated_at=excluded.updated_at
  `).run(step, baseTs || null, now());
}

export async function persistFindings(zone, anomalies, correlation) {
  const detectedAt = now();
  const anomalyRecords = (anomalies || []).map((anomaly) => ({
    id: randomUUID(),
    zone_id: zone.id,
    event_type: anomaly.event_type,
    metric: anomaly.metric,
    baseline_value: anomaly.baseline_value,
    current_value: anomaly.current_value,
    change_percent: anomaly.change_percent,
    severity: anomaly.severity,
    detected_at: detectedAt,
    metadata: { label: anomaly.label },
  }));
  const correlationRecords = correlation
    ? [
        {
          id: randomUUID(),
          zone_id: zone.id,
          event_a_id: correlation.event_a_id,
          event_b_id: correlation.event_b_id,
          correlation_type: correlation.correlation_type,
          confidence: correlation.confidence,
          time_overlap: correlation.time_overlap,
          location_overlap: correlation.location_overlap,
          explanation: correlation.explanation,
          detected_at: detectedAt,
          metadata: {
            evidence: correlation.evidence,
            factors: correlation.factors,
            window: correlation.window,
          },
        },
      ]
    : [];

  if (useMongo) {
    const database = await getMongoDatabase();
    await withMongoTransaction(database, async (session) => {
      if (anomalyRecords.length) {
        await database.collection("anomalies").insertMany(anomalyRecords, { session });
      }
      if (correlationRecords.length) {
        await database.collection("correlations").insertMany(correlationRecords, { session });
      }
    });
    return;
  }
  const db = await getSqliteDatabase();
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
  runSqliteTransaction(db, () => {
    for (const anomaly of anomalyRecords) {
      insertAnomaly.run(
        anomaly.id, anomaly.zone_id, anomaly.event_type, anomaly.metric,
        anomaly.baseline_value, anomaly.current_value, anomaly.change_percent,
        anomaly.severity, anomaly.detected_at, JSON.stringify(anomaly.metadata),
      );
    }
    for (const item of correlationRecords) {
      insertCorrelation.run(
        item.id, item.zone_id, item.event_a_id, item.event_b_id,
        item.correlation_type, item.confidence, item.time_overlap,
        item.location_overlap, item.explanation, item.detected_at,
        JSON.stringify(item.metadata),
      );
    }
  });
}

export async function createInsightAndAlert(zone, correlation, summary, ai) {
  const insightId = randomUUID();
  const createdAt = now();
  const insight = {
    id: insightId,
    zone_id: zone.id,
    title: `Possible weather-related disruption in ${zone.label}`,
    summary,
    severity: "high",
    confidence: correlation.confidence,
    insight_type: "correlation",
    source_event_ids: [correlation.event_a_id, correlation.event_b_id].filter(Boolean),
    metadata: { ai, evidence: correlation.evidence, window: correlation.window },
    created_at: createdAt,
    expires_at: null,
  };
  const alert = {
    id: randomUUID(),
    zone_id: zone.id,
    insight_id: insightId,
    alert_type: "correlation",
    severity: "high",
    title: "Possible traffic disruption",
    message: `Heavy rainfall coincides with a rise in traffic incidents and transit delays in ${zone.label}.`,
    status: "active",
    created_at: createdAt,
    resolved_at: null,
  };
  if (useMongo) {
    const database = await getMongoDatabase();
    await withMongoTransaction(database, async (session) => {
      await database.collection("insights").insertOne(insight, { session });
      await database.collection("alerts").insertOne(alert, { session });
    });
    return insightId;
  }

  const db = await getSqliteDatabase();
  runSqliteTransaction(db, () => {
    db.prepare(`
      INSERT INTO insights
        (id, zone_id, title, summary, severity, confidence, insight_type,
         source_event_ids, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      insight.id, insight.zone_id, insight.title, insight.summary, insight.severity,
      insight.confidence, insight.insight_type, JSON.stringify(insight.source_event_ids),
      JSON.stringify(insight.metadata), insight.created_at,
    );
    db.prepare(`
      INSERT INTO alerts
        (id, zone_id, insight_id, alert_type, severity, title, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.id, alert.zone_id, alert.insight_id, alert.alert_type, alert.severity,
      alert.title, alert.message, alert.status, alert.created_at,
    );
  });
  return insightId;
}

export async function resolveAlert(id) {
  if (useMongo) {
    const database = await getMongoDatabase();
    const result = await database.collection("alerts").updateOne(
      { id, status: "active" },
      { $set: { status: "resolved", resolved_at: now() } },
    );
    return result.modifiedCount > 0;
  }
  const db = await getSqliteDatabase();
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
  let zones;
  let events;
  let insights;
  let alerts;
  let sim;

  if (useMongo) {
    if (!mongoUri) {
      zones = ZONES;
      events = [];
      insights = [];
      alerts = [];
      sim = { step: 0, base_ts: null };
    } else {
      const database = await getMongoDatabase();
      const [zoneRows, eventRows, insightRows, alertRows, simState] = await Promise.all([
        database.collection("zones").find({}, { projection: { _id: 0 } }).sort({ label: 1 }).toArray(),
        database.collection("civic_events").find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).limit(400).toArray(),
        database.collection("insights").find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
        database.collection("alerts").find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
        database.collection("sim_state").findOne({ _id: "demo" }),
      ]);
      zones = zoneRows;
      events = eventRows;
      insights = insightRows;
      alerts = alertRows;
      sim = mongoRecord(simState) || { step: 0, base_ts: null };
    }
  } else {
    const db = await getSqliteDatabase();
    zones = db.prepare("SELECT * FROM zones ORDER BY label").all();
    events = db
      .prepare("SELECT * FROM civic_events ORDER BY timestamp DESC LIMIT 400")
      .all()
      .map(rowToRecord)
      .map((event) => ({ ...event, value: event.value == null ? null : Number(event.value) }));
    insights = db
      .prepare("SELECT * FROM insights ORDER BY created_at DESC LIMIT 50")
      .all()
      .map(rowToRecord);
    alerts = db.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50").all();
    sim = await getSimState();
  }

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
