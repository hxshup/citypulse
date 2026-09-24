import { NextResponse } from "next/server";
import { ZONE3_ID } from "@/lib/civic/config";
import { seedNormalEvents, scenarioStepEvents } from "@/lib/civic/synthetic";
import { generateGroundedSummary } from "@/lib/civic/ai";
import {
  ensureZones,
  clearScenarioData,
  insertEvents,
  getSimState,
  setSimState,
  buildSnapshot,
  persistFindings,
  createInsightAndAlert,
  resolveAlert,
  getZones,
} from "@/lib/civic/store";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGINS || "*",
  );
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return res;
}

export async function OPTIONS() {
  return json({}, 200);
}

async function readTable(table, limit = 100) {
  const sb = supabaseServer();
  const orderCol =
    table === "civic_events"
      ? "timestamp"
      : table === "anomalies" || table === "correlations"
        ? "detected_at"
        : "created_at";
  const { data, error } = await sb
    .from(table)
    .select("*")
    .order(orderCol, { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
async function resolveExpiredEvents() {
  const sb = supabaseServer();

  const { data: events, error } = await sb
    .from("civic_events")
    .select("id, status, metadata")
    .eq("status", "active");

  if (error || !events?.length) return;

  const now = Date.now();

  const expiredIds = events
    .filter((event) => {
      const expiresAt = event.metadata?.expires_at;
      return expiresAt && new Date(expiresAt).getTime() <= now;
    })
    .map((event) => event.id);

  if (!expiredIds.length) return;

  await sb
    .from("civic_events")
    .update({ status: "resolved" })
    .in("id", expiredIds);
}
async function getRealWeather(zone) {
  try {
    const key = process.env.WEATHERAPI_KEY;

    if (!key) return null;

    const response = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(
        key,
      )}&q=${zone.latitude},${zone.longitude}&aqi=no`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      condition: data.current?.condition?.text || "Current weather",
      temperature: data.current?.temp_c ?? null,
      rainfall: data.current?.precip_mm ?? 0,
      humidity: data.current?.humidity ?? null,
      wind: data.current?.wind_kph ?? null,
    };
  } catch (error) {
    console.error("Real weather unavailable:", error);
    return null;
  }
}
async function generateLiveEvent() {
  const sb = supabaseServer();

  const { data: zones, error: zoneError } = await sb
    .from("zones")
    .select("*")
    .order("label");

  if (zoneError || !zones?.length) return;

  const zone = zones[Math.floor(Math.random() * zones.length)];

  const realWeather = await getRealWeather(zone);

  const types = [
    {
      source: "weather",
      event_type: "rainfall",
      title: realWeather
        ? `${realWeather.condition} in ${zone.name}`
        : "Light rainfall detected",
      description: realWeather
        ? `Live weather observation: ${realWeather.condition}${
            realWeather.temperature != null
              ? `, ${realWeather.temperature}°C`
              : ""
          }${
            realWeather.humidity != null
              ? `, ${realWeather.humidity}% humidity`
              : ""
          }.`
        : `Rainfall detected in ${zone.name}.`,
      value: realWeather
        ? realWeather.rainfall
        : Math.round((Math.random() * 8 + 2) * 10) / 10,
      unit: "mm",
    },
    {
      source: "traffic",
      event_type: "incident",
      title: "Traffic activity detected",
      description: `Increased traffic activity reported in ${zone.name}.`,
      value: Math.floor(Math.random() * 6) + 2,
      unit: "incidents",
    },
    {
      source: "transit",
      event_type: "delay",
      title: "Transit delay detected",
      description: `Minor transit delay reported in ${zone.name}.`,
      value: Math.floor(Math.random() * 8) + 2,
      unit: "min",
    },
  ];

  const event = types[Math.floor(Math.random() * types.length)];
  const severity = Math.random() > 0.75 ? "medium" : "low";

  const { data: insertedEvent, error: insertError } = await sb
    .from("civic_events")
    .insert({
      source: event.source,
      event_type: event.event_type,
      title: event.title,
      description: event.description,
      zone_id: zone.id,
      latitude: zone.latitude + (Math.random() - 0.5) * 0.004,
      longitude: zone.longitude + (Math.random() - 0.5) * 0.004,
      severity,
      value: event.value,
      unit: event.unit,
      status: "active",
      timestamp: new Date().toISOString(),
      metadata: {
        generated: true,
        live: true,
        expires_at: new Date(
          Date.now() +
            (event.source === "weather"
              ? (20 + Math.random() * 10) * 1000
              : event.source === "traffic"
                ? (25 + Math.random() * 10) * 1000
                : (30 + Math.random() * 10) * 1000),
        ).toISOString(),
      },
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }
  if (insertedEvent?.id && (severity === "medium" || severity === "high")) {
    const { error: alertError } = await sb.from("alerts").insert({
      zone_id: zone.id,
      alert_type: "incident",
      severity,
      title: event.title,
      message: `${event.description} This incident is currently active.`,
      status: "active",
    });

    if (alertError) {
      throw alertError;
    }
  }
}

// ---- Scenario driver ------------------------------------------------------
async function scenarioReset() {
  await ensureZones();
  await clearScenarioData();
  const base = new Date().toISOString();
  await insertEvents(seedNormalEvents(base));
  await setSimState(0, base);
  return { step: 0, message: "City reset to normal state" };
}

async function scenarioAdvance() {
  const sim = await getSimState();
  const base = sim.base_ts || new Date().toISOString();
  const next = Math.min((sim.step || 0) + 1, 5);
  if (sim.step >= 5)
    return { step: 5, message: "Scenario complete", done: true };

  if (next <= 3) {
    await insertEvents(scenarioStepEvents(next, base));
    await setSimState(next, base);
    const labels = {
      1: "Heavy rainfall began in Zone 3",
      2: "Traffic incidents spiking in Zone 3",
      3: "Transit delays rising in Zone 3",
    };
    return { step: next, message: labels[next] };
  }

  // Steps 4 & 5 work on the deterministic snapshot for Zone 3
  const snap = await buildSnapshot();
  const z3 = snap.zones.find((v) => v.zone.id === ZONE3_ID);

  if (next === 4) {
    if (z3?.anomalies?.length)
      await persistFindings(z3.zone, z3.anomalies, z3.correlation);
    await setSimState(4, base);
    return {
      step: 4,
      message: "Anomalies + correlation detected in Zone 3",
      correlation: z3?.correlation || null,
    };
  }

  // next === 5: grounded AI insight + alert
  if (z3?.correlation) {
    const c = z3.correlation;
    const finding = {
      zoneName: z3.zone.label,
      rainfall: z3.signals.weather.rainfall,
      trafficPct: Math.round(z3.signals.traffic.pct),
      transitPct:
        z3.signals.transit.pct >= 40
          ? Math.round(z3.signals.transit.pct)
          : null,
      timeOverlapMin: c.time_overlap,
      confidence: c.confidence,
    };
    const { summary, ai } = await generateGroundedSummary(finding);
    await createInsightAndAlert(z3.zone, c, summary, ai);
    await setSimState(5, base);
    return {
      step: 5,
      message: "CityPulse generated an insight",
      summary,
      ai,
      done: true,
    };
  }
  await setSimState(5, base);
  return { step: 5, message: "Scenario complete (no correlation)", done: true };
}

// ---- Router ---------------------------------------------------------------
async function handle(request, { params }) {
  const { path = [] } = await params;
  const route = `/${(path || []).join("/")}`;
  const method = request.method;

  try {
    if (route === "/" || route === "/root")
      return json({ app: "CityPulse", status: "ok" });

    if (route === "/state" && method === "GET") {
      await ensureZones();
      await resolveExpiredEvents();
      return json(await buildSnapshot());
    }
    if (route === "/live-event" && method === "POST") {
      await ensureZones();
      await generateLiveEvent();
      return json({ ok: true, message: "Live event generated" });
    }
    if (route === "/zones" && method === "GET") return json(await getZones());

    if (route === "/events" && method === "GET")
      return json(await readTable("civic_events", 400));
    if (path[0] === "events" && path[1] && method === "GET") {
      const events = await readTable("civic_events", 400);
      const found = events.find((e) => e.id === path[1]);
      if (!found) return json({ error: "Event not found" }, 404);
      return json(found);
    }
    if (route === "/anomalies" && method === "GET")
      return json(await readTable("anomalies"));
    if (route === "/correlations" && method === "GET")
      return json(await readTable("correlations"));
    if (route === "/insights" && method === "GET")
      return json(await readTable("insights"));
    if (route === "/alerts" && method === "GET")
      return json(await readTable("alerts"));

    if (route === "/scenario/reset" && method === "POST")
      return json(await scenarioReset());
    if (route === "/scenario/advance" && method === "POST")
      return json(await scenarioAdvance());

    if (path[0] === "alerts" && path[2] === "resolve" && method === "POST") {
      await resolveAlert(path[1]);
      return json({ ok: true });
    }

    return json({ error: `Route ${route} not found` }, 404);
  } catch (error) {
    console.error("API Error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
