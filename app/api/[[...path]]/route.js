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
  listRecords,
  getEvent,
} from "@/lib/civic/store";
import {
  getJaipurAreaBriefing,
  getJaipurPlaces,
  searchJaipurPlaces,
  isJaipurCoordinate,
} from "@/lib/civic/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestLimits = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS = {
  read: 180,
  search: 18,
  area: 24,
  write: 20,
};
let lastRateMapCleanup = Date.now();

function json(data, status = 200, headers = {}) {
  return NextResponse.json(data, { status, headers });
}

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") || forwarded || "unknown";
}

function rateLimit(request, route, kind) {
  const now = Date.now();
  if (now - lastRateMapCleanup > RATE_WINDOW_MS) {
    for (const [key, value] of requestLimits) {
      if (value.expiresAt <= now) requestLimits.delete(key);
    }
    lastRateMapCleanup = now;
  }

  const key = `${clientKey(request)}:${route}`;
  const entry = requestLimits.get(key);
  if (!entry || entry.expiresAt <= now) {
    requestLimits.set(key, { count: 1, expiresAt: now + RATE_WINDOW_MS });
    return null;
  }
  entry.count += 1;
  if (entry.count <= RATE_LIMITS[kind]) return null;
  return json(
    { error: "Too many requests. Please wait before trying again." },
    429,
    { "Retry-After": String(Math.ceil((entry.expiresAt - now) / 1000)) },
  );
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const candidate = new URL(origin);
    const expected = new URL(request.url);
    return candidate.origin === expected.origin;
  } catch {
    return false;
  }
}

export async function OPTIONS(request) {
  const origin = request.headers.get("origin");
  if (origin && !sameOrigin(request)) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }
  return new NextResponse(null, { status: 204 });
}

function parseJaipurCoordinates(url) {
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));
  if (!isJaipurCoordinate(latitude, longitude)) return null;
  const name = url.searchParams.get("name")?.trim().slice(0, 80);
  const language = url.searchParams.get("language") === "hi" ? "hi" : "en";
  if (!name) return null;
  return { latitude, longitude, name, language };
}

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
  if (sim.step >= 5) {
    return { step: 5, message: "Scenario complete", done: true };
  }

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

  const snapshot = await buildSnapshot();
  const zone = snapshot.zones.find((view) => view.zone.id === ZONE3_ID);
  if (next === 4) {
    if (zone?.anomalies.length) {
      await persistFindings(zone.zone, zone.anomalies, zone.correlation);
    }
    await setSimState(4, base);
    return {
      step: 4,
      message: "Anomalies + correlation detected in Zone 3",
      correlation: zone?.correlation || null,
    };
  }

  if (zone?.correlation) {
    const correlation = zone.correlation;
    const finding = {
      zoneName: zone.zone.label,
      rainfall: zone.signals.weather.rainfall,
      trafficPct: Math.round(zone.signals.traffic.pct),
      transitPct:
        zone.signals.transit.pct >= 40
          ? Math.round(zone.signals.transit.pct)
          : null,
      timeOverlapMin: correlation.time_overlap,
      confidence: correlation.confidence,
    };
    const { summary, ai } = await generateGroundedSummary(finding);
    await createInsightAndAlert(zone.zone, correlation, summary, ai);
    await setSimState(5, base);
    return { step: 5, message: "CityPulse generated an insight", summary, ai, done: true };
  }
  await setSimState(5, base);
  return { step: 5, message: "Scenario complete (no correlation)", done: true };
}

async function handle(request, { params }) {
  const { path = [] } = await params;
  const route = `/${(path || []).join("/")}`;
  const method = request.method;
  const writeRequest = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (writeRequest && !sameOrigin(request)) {
    return json({ error: "Cross-origin mutation rejected." }, 403);
  }
  const kind =
    route === "/jaipur/search"
      ? "search"
      : route === "/jaipur/area"
        ? "area"
        : writeRequest
          ? "write"
          : "read";
  const rateRoute =
    path[0] === "events" && path[1]
      ? "/events/:id"
      : path[0] === "alerts" && path[1]
        ? "/alerts/:id/resolve"
        : route;
  const limited = rateLimit(request, rateRoute, kind);
  if (limited) return limited;

  try {
    if (route === "/" || route === "/root") {
      return json({ app: "CityPulse", status: "ok", database: "sqlite" });
    }
    if (route === "/state" && method === "GET") {
      await ensureZones();
      return json(await buildSnapshot());
    }
    if (route === "/zones" && method === "GET") {
      await ensureZones();
      return json(await getZones());
    }
    if (route === "/jaipur/search" && method === "GET") {
      const query = new URL(request.url).searchParams.get("q") || "";
      if (query.trim().length < 3 || query.length > 80) {
        return json({ error: "Search must be between 3 and 80 characters." }, 400);
      }
      return json(await searchJaipurPlaces(query));
    }
    if (route === "/jaipur/area" && method === "GET") {
      const area = parseJaipurCoordinates(new URL(request.url));
      if (!area) {
        return json({ error: "A valid Jaipur location name, latitude, and longitude are required." }, 400);
      }
      return json(await getJaipurAreaBriefing(area));
    }
    if (route === "/jaipur/places" && method === "GET") {
      const group = new URL(request.url).searchParams.get("group") || "all";
      if (!["all", "areas", "hospitals", "landmarks"].includes(group)) {
        return json({ error: "Unsupported Jaipur places category." }, 400);
      }
      return json(await getJaipurPlaces(group));
    }

    if (route === "/events" && method === "GET") {
      return json(await listRecords("civic_events", 400));
    }
    if (path[0] === "events" && path[1] && method === "GET") {
      const event = await getEvent(path[1]);
      if (!event) return json({ error: "Event not found" }, 404);
      return json(event);
    }
    if (["anomalies", "correlations", "insights", "alerts"].includes(path[0]) && path.length === 1 && method === "GET") {
      return json(await listRecords(path[0]));
    }
    if (route === "/scenario/reset" && method === "POST") {
      return json(await scenarioReset());
    }
    if (route === "/scenario/advance" && method === "POST") {
      return json(await scenarioAdvance());
    }
    if (path[0] === "alerts" && path[1] && path[2] === "resolve" && method === "POST") {
      const resolved = await resolveAlert(path[1]);
      if (!resolved) return json({ error: "Active alert not found." }, 404);
      return json({ ok: true });
    }
    return json({ error: `Route ${route} not found` }, 404);
  } catch (error) {
    console.error("[citypulse.api]", route, error);
    return json({ error: "The civic service could not complete this request." }, 500);
  }
}

export const GET = handle;
export const POST = handle;
