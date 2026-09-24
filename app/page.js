"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  CloudRain,
  Car,
  Bus,
  AlertTriangle,
  MapPin,
  Radio,
  RefreshCw,
  Menu,
  Play,
  SkipForward,
  Zap,
  Clock,
  Gauge,
  Network,
  Bell,
  History,
  LayoutDashboard,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  CircleDot,
} from "lucide-react";

const CivicMap = dynamic(() => import("@/components/civic/CivicMap"), {
  ssr: false,
});

/* ----------------------------- helpers ----------------------------- */
const SEV = {
  high: {
    label: "HIGH",
    text: "text-rose-300",
    bg: "bg-rose-500/15",
    ring: "border-rose-500/40",
    dot: "bg-rose-400",
  },
  medium: {
    label: "MEDIUM",
    text: "text-amber-300",
    bg: "bg-amber-500/15",
    ring: "border-amber-500/40",
    dot: "bg-amber-400",
  },
  low: {
    label: "LOW",
    text: "text-emerald-300",
    bg: "bg-emerald-500/15",
    ring: "border-emerald-500/40",
    dot: "bg-emerald-400",
  },
};
const sev = (s) => SEV[s] || SEV.low;
const pulseColor = (v) =>
  v >= 80 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : "text-rose-400";
const pulseStroke = (v) =>
  v >= 80 ? "#34d399" : v >= 60 ? "#fbbf24" : "#fb7185";
const fmtTime = (t) =>
  t
    ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--";

const SOURCE_META = {
  weather: { icon: CloudRain, color: "text-sky-300", name: "Weather" },
  traffic: { icon: Car, color: "text-amber-300", name: "Traffic" },
  transit: { icon: Bus, color: "text-violet-300", name: "Transit" },
};

function scopeView(snapshot, scope) {
  if (!snapshot) return null;
  if (scope !== "city") {
    const zv = snapshot.zones.find((v) => v.zone.id === scope);
    if (zv)
      return {
        pulse: zv.pulse,
        signals: zv.signals,
        correlation: zv.correlation,
      };
  }
  // City aggregate
  const zs = snapshot.zones;
  const agg = {
    weather: (() => {
      const liveWeather = zs
        .map((v) => v.signals.weather.event)
        .find((event) => event?.metadata?.live === true);

      return {
        rainfall:
          liveWeather?.value ??
          Math.max(0, ...zs.map((v) => v.signals.weather.rainfall)),
        severity: liveWeather?.severity ?? "low",
        title: liveWeather?.title ?? "Current weather",
        status: "ok",
        event: liveWeather ?? null,
      };
    })(),
    traffic: {
      count: sum(zs.map((v) => v.signals.traffic.count)),
      pct: Math.max(0, ...zs.map((v) => v.signals.traffic.pct)),
      severity: worst(zs.map((v) => v.signals.traffic.severity)),
    },
    transit: {
      count: sum(zs.map((v) => v.signals.transit.count)),
      pct: Math.max(0, ...zs.map((v) => v.signals.transit.pct)),
      severity: worst(zs.map((v) => v.signals.transit.severity)),
      avgDelay: Math.round(avg(zs.map((v) => v.signals.transit.avgDelay))),
    },
    incidents: {
      count: sum(zs.map((v) => v.signals.incidents.count)),
      severity: worst(zs.map((v) => v.signals.incidents.severity)),
    },
  };
  return {
    pulse: { score: snapshot.city.pulse, factors: snapshot.city.factors },
    signals: agg,
    correlation: null,
  };
}
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const worst = (a) =>
  a.includes("high") ? "high" : a.includes("medium") ? "medium" : "low";

/* ----------------------------- small UI ----------------------------- */
function PulseRing({ score }) {
  const R = 76,
    C = 2 * Math.PI * R;
  const off = C - (score / 100) * C;
  return (
    <div className="relative h-48 w-48 shrink-0">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle
          cx="90"
          cy="90"
          r={R}
          stroke="#1e293b"
          strokeWidth="12"
          fill="none"
        />
        <circle
          cx="90"
          cy="90"
          r={R}
          stroke={pulseStroke(score)}
          strokeWidth="12"
          fill="none"
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease, stroke 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={`text-5xl font-extrabold tabular-nums ${pulseColor(score)}`}
        >
          {score}
        </div>
        <div className="text-xs uppercase tracking-widest text-slate-500">
          / 100
        </div>
      </div>
    </div>
  );
}

function FactorBar({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold tabular-nums ${pulseColor(value)}`}>
          {value}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: pulseStroke(value) }}
        />
      </div>
    </div>
  );
}

function SignalCard({
  source,
  icon: Icon,
  name,
  status,
  severity,
  change,
  sub,
}) {
  const s = sev(severity);
  return (
    <div
      className={`rounded-xl border ${s.ring} bg-slate-900/60 p-4 backdrop-blur`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={`h-4 w-4 ${SOURCE_META[source]?.color || "text-slate-300"}`}
          />
          <span className="text-sm font-semibold text-slate-200">{name}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${s.bg} ${s.text}`}
        >
          {s.label}
        </span>
      </div>
      <div className="mt-3 text-sm text-slate-300">{status}</div>
      {change != null && (
        <div
          className={`mt-1 text-xs font-semibold ${change > 0 ? "text-rose-300" : "text-slate-500"}`}
        >
          {change > 0 ? `+${change}% vs baseline` : "nominal"}
        </div>
      )}
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------- main app ----------------------------- */
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "map", label: "Live Map", icon: MapPin },
  { id: "intelligence", label: "Intelligence", icon: Network },
  { id: "events", label: "Events", icon: Clock },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "replay", label: "Replay", icon: History },
];

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState("city");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [activity, setActivity] = useState([]);
  const previousEventsRef = useRef(new Map());
  const [layers, setLayers] = useState({
    weather: true,
    traffic: true,
    transit: true,
    anomalies: true,
  });
  const playRef = useRef(false);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      const previousEvents = previousEventsRef.current;

      const currentEvents = new Map(
        (d.events || []).map((event) => [event.id, event]),
      );

      const changes = [];

      for (const event of d.events || []) {
        const previous = previousEvents.get(event.id);

        // Newly detected active incident
        if (!previous && event.status === "active") {
          changes.push({
            id: `${event.id}-active-${Date.now()}`,
            type: "new",
            event,
            time: Date.now(),
          });
        }

        // Previously active incident has now resolved
        if (previous?.status === "active" && event.status === "resolved") {
          changes.push({
            id: `${event.id}-resolved-${Date.now()}`,
            type: "resolved",
            event,
            time: Date.now(),
          });
        }
      }

      previousEventsRef.current = currentEvents;

      if (changes.length) {
        setActivity((prev) => [...changes, ...prev].slice(0, 6));

        changes.forEach((change) => {
          setTimeout(() => {
            setActivity((prev) => prev.filter((item) => item.id !== change.id));
          }, 5000);
        });
      }

      setSnapshot(d);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 4000);
    return () => clearInterval(id);
  }, [fetchState]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  async function doRefreshScores() {
    setBusy(true);
    try {
      await fetchState();
      flash("Live civic scores refreshed");
    } finally {
      setBusy(false);
    }
  }
  async function doGenerateLiveEvent() {
    setBusy(true);
    try {
      const r = await fetch("/api/live-event", { method: "POST" });
      const d = await r.json();

      if (!r.ok) throw new Error(d.error || "Failed to generate event");

      flash("Live event generated");
      await fetchState();
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (playing) return;

    const id = setInterval(() => {
      doGenerateLiveEvent();
    }, 10000);

    return () => clearInterval(id);
  }, [playing]);
  async function doAdvance() {
    setBusy(true);
    try {
      const r = await fetch("/api/scenario/advance", { method: "POST" });
      const d = await r.json();
      flash(d.message);
      await fetchState();
      return d;
    } finally {
      setBusy(false);
    }
  }
  async function doPlay() {
    if (playRef.current) return;
    playRef.current = true;
    setPlaying(true);
    await fetch("/api/scenario/reset", { method: "POST" });
    flash("Scenario started — normal city state");
    await fetchState();
    for (let i = 0; i < 5; i++) {
      await new Promise((res) => setTimeout(res, 2600));
      if (!playRef.current) break;
      const d = await doAdvance();
      if (d?.done) break;
    }
    playRef.current = false;
    setPlaying(false);
  }

  const view = useMemo(() => scopeView(snapshot, scope), [snapshot, scope]);
  const activeCorrelation = useMemo(
    () => snapshot?.correlations?.[0] || null,
    [snapshot],
  );
  const latestInsight = useMemo(
    () => snapshot?.insights?.[0] || null,
    [snapshot],
  );
  const step = snapshot?.step ?? 0;

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={{
        backgroundImage:
          "radial-gradient(1200px 500px at 80% -10%, rgba(56,189,248,0.08), transparent), radial-gradient(1000px 400px at 0% 0%, rgba(168,85,247,0.06), transparent)",
      }}
    >
      {/* Live Incident Activity */}
      {activity.length > 0 && (
        <div className="fixed right-5 top-20 z-50 w-[340px] space-y-2"></div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 sm:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 shadow-lg shadow-sky-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight">
                CITYPULSE
              </div>
              <div className="text-[11px] text-slate-400">
                Live Civic Intelligence
              </div>
            </div>
          </div>

          <div className="ml-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              LIVE
            </span>
            <Chip tone="slate">
              <MapPin className="h-3 w-3" /> {snapshot?.city?.name || "Jaipur"}
            </Chip>
            <Chip tone="slate">
              <Clock className="h-3 w-3" /> {fmtTime(snapshot?.lastUpdated)}
            </Chip>
          </div>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            {(snapshot?.feeds || []).map((f) => {
              const M = SOURCE_META[f.source];
              const ok = f.status === "ok";
              return (
                <span
                  key={f.source}
                  title={`${M?.name}: ${f.status}`}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${ok ? "text-slate-300" : "text-amber-300"}`}
                >
                  <CircleDot
                    className={`h-3 w-3 ${ok ? "text-emerald-400" : "text-amber-400"}`}
                  />{" "}
                  {M?.name}
                </span>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="mr-1 hidden text-xs text-slate-400 sm:block">
              Demo step{" "}
              <span className="font-bold text-slate-200">{step}/5</span>
            </div>
            <button
              onClick={doPlay}
              disabled={busy || playing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />{" "}
              {playing ? "Playing…" : "Play Zone-3 Scenario"}
            </button>
            <button
              onClick={doAdvance}
              disabled={busy || playing || step >= 5}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" /> Next
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 sm:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="fixed left-0 top-0 z-50 h-full w-72 border-r border-slate-800 bg-slate-950 shadow-2xl sm:hidden">
              <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600">
                    <Activity className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-slate-100">CITYPULSE</span>
                </div>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Close navigation"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1 p-3">
                {TABS.map((t) => {
                  const active = tab === t.id;

                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTab(t.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition ${
                        active
                          ? "bg-sky-500/10 text-sky-300"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <t.icon className="h-4 w-4" />
                      <span>{t.label}</span>

                      {t.id === "alerts" &&
                        snapshot?.alerts?.filter((a) => a.status === "active")
                          .length > 0 && (
                          <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                            {
                              snapshot.alerts.filter(
                                (a) => a.status === "active",
                              ).length
                            }
                          </span>
                        )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* tabs */}
        <div className="mx-auto hidden max-w-[1400px] gap-1 overflow-x-auto px-4 sm:flex">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${active ? "border-sky-400 text-sky-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
                {t.id === "alerts" &&
                  snapshot?.alerts?.filter((a) => a.status === "active")
                    .length > 0 && (
                    <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                      {
                        snapshot.alerts.filter((a) => a.status === "active")
                          .length
                      }
                    </span>
                  )}
              </button>
            );
          })}
        </div>
      </header>
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="fixed left-0 top-0 z-50 h-full w-72 border-r border-slate-800 bg-slate-950 shadow-2xl sm:hidden">
            <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-slate-100">CITYPULSE</span>
              </div>

              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 p-3">
              {TABS.map((t) => {
                const active = tab === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition ${
                      active
                        ? "bg-sky-500/10 text-sky-300"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <t.icon className="h-4 w-4" />
                    <span>{t.label}</span>

                    {t.id === "alerts" &&
                      snapshot?.alerts?.filter((a) => a.status === "active")
                        .length > 0 && (
                        <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                          {
                            snapshot.alerts.filter((a) => a.status === "active")
                              .length
                          }
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <main className="mx-auto max-w-[1400px] px-4 py-6">
        {loading && (
          <div className="flex h-64 items-center justify-center text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading civic
            signals…
          </div>
        )}
        {!loading && err && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-200">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5" /> Could not reach the data
              layer
            </div>
            <p className="text-sm">{err}</p>
            <p className="mt-2 text-sm text-amber-300/80">
              If this is the first run, make sure the Supabase schema has been
              created (see <code>supabase_migration.sql</code>).
            </p>
          </div>
        )}

        {!loading && !err && snapshot && (
          <>
            {tab === "overview" && (
              <Overview
                snapshot={snapshot}
                view={view}
                scope={scope}
                setScope={setScope}
                correlation={activeCorrelation}
                insight={latestInsight}
                goIntel={() => setTab("intelligence")}
                activity={activity}
              />
            )}
            {tab === "map" && (
              <MapTab
                snapshot={snapshot}
                layers={layers}
                setLayers={setLayers}
                scope={scope}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
              />
            )}
            {tab === "intelligence" && (
              <Intelligence
                snapshot={snapshot}
                correlation={activeCorrelation}
                insight={latestInsight}
              />
            )}
            {tab === "events" && (
              <Events
                snapshot={snapshot}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
              />
            )}
            {tab === "alerts" && (
              <Alerts snapshot={snapshot} refresh={fetchState} />
            )}
            {tab === "replay" && <Replay snapshot={snapshot} />}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-2.5 text-sm text-slate-100 shadow-2xl">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400 align-middle" />
          {toast}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Overview ----------------------------- */
function Overview({
  snapshot,
  view,
  scope,
  setScope,
  correlation,
  insight,
  goIntel,
  activity,
}) {
  if (!view) return null;
  const f = view.pulse.factors;
  const s = view.signals;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Hero pulse */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 lg:col-span-1">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Civic Pulse
          </div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
          >
            <option value="city">Whole City</option>
            {snapshot.zones.map((v) => (
              <option key={v.zone.id} value={v.zone.id}>
                {v.zone.label} · {v.zone.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex min-w-[180px] flex-col items-center">
            <PulseRing score={view.pulse.score} />
          </div>

          <div className="flex-1 space-y-3">
            <FactorBar label="Weather" value={f.weather} />
            <FactorBar label="Traffic" value={f.traffic} />
            <FactorBar label="Transit" value={f.transit} />
            <FactorBar label="Incidents" value={f.incidents} />
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          An operational indicator derived from current civic signals — not a
          judgement of the area.
        </p>
        <div className="mt-6 flex min-h-[120px] items-center justify-center">
          {activity.length > 0 &&
            (() => {
              const item = activity[0];
              const event = item.event;
              const isResolved = item.type === "resolved";

              const zone = snapshot?.zones?.find(
                (z) => z.zone.id === event.zone_id,
              );

              return (
                <div
                  className={`w-full max-w-[320px] rounded-xl border px-4 py-3 text-center transition-all duration-500 ${
                    isResolved
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-orange-500/30 bg-orange-500/10"
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isResolved ? "text-emerald-300" : "text-orange-300"
                    }`}
                  >
                    {isResolved ? "● Incident Resolved" : "● Incident Detected"}
                  </div>

                  <div className="mt-1.5 text-sm font-semibold text-slate-100">
                    {event.title}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {zone?.zone?.label || "Unknown Zone"}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>

      {/* Signals */}
      <div className="lg:col-span-2">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Active Signals
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignalCard
            source="weather"
            icon={CloudRain}
            name="Weather"
            severity={s.weather.severity}
            status={
              s.weather.event?.metadata?.temperature != null
                ? `${s.weather.event?.title || s.weather.title} · ${s.weather.event.metadata.temperature}°C`
                : s.weather.rainfall >= 4
                  ? `Heavy rainfall · ${s.weather.rainfall} mm/h`
                  : `Clear · ${s.weather.rainfall} mm/h`
            }
            sub={`Humidity ${
              s.weather.event?.metadata?.humidity != null
                ? `${s.weather.event.metadata.humidity}%`
                : "—"
            } · Rainfall ${s.weather.rainfall} mm/h`}
          />
          <SignalCard
            source="traffic"
            icon={Car}
            name="Traffic"
            severity={s.traffic.severity}
            status={`${s.traffic.count} active incidents`}
            change={Math.round(s.traffic.pct)}
          />
          <SignalCard
            source="transit"
            icon={Bus}
            name="Transit"
            severity={s.transit.severity}
            status={`${s.transit.count} delayed routes`}
            change={Math.round(s.transit.pct)}
            sub={`avg delay ${s.transit.avgDelay || 0} min`}
          />
          <SignalCard
            source="incidents"
            icon={AlertTriangle}
            name="Incidents"
            severity={s.incidents.severity}
            status={`${s.incidents.count} high-severity events`}
          />
        </div>

        {/* Intelligence card */}
        <div className="mt-4">
          {correlation ? (
            <div className="relative overflow-hidden rounded-2xl border border-sky-500/40 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sky-300">
                    <Zap className="h-5 w-5" />
                    <span className="text-sm font-bold uppercase tracking-wide">
                      Possible Correlation Detected
                    </span>
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-slate-200">
                    {correlation.explanation}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      correlation.metadata?.evidence ||
                      correlation.evidence ||
                      []
                    ).map((ev, i) => (
                      <Chip key={i} tone="slate">
                        {ev.label}: <b className="ml-1">{ev.value}</b>
                      </Chip>
                    ))}
                    <Chip tone="sky">
                      <Clock className="h-3 w-3" /> {correlation.time_overlap}{" "}
                      min overlap
                    </Chip>
                    <Chip tone="violet">
                      <MapPin className="h-3 w-3" /> {correlation.zoneLabel}
                    </Chip>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-extrabold text-sky-300">
                    {correlation.confidence}%
                  </div>
                  <div className="text-[11px] uppercase tracking-widest text-slate-400">
                    confidence
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-amber-300/90">
                  ⚠ Possible correlation — not confirmed causation.
                </span>
                <button
                  onClick={goIntel}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  Explore Pattern <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                <span className="font-semibold">All signals nominal</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                No cross-signal correlations detected. Run the Zone-3 scenario
                to see the intelligence engine in action.
              </p>
            </div>
          )}
        </div>

        {insight && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-1 flex items-center gap-2 text-slate-300">
              <Sparkles className="h-4 w-4 text-violet-300" />
              <span className="text-sm font-semibold">{insight.title}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${insight.metadata?.ai ? "bg-violet-500/15 text-violet-300" : "bg-slate-700 text-slate-300"}`}
              >
                {insight.metadata?.ai
                  ? "AI GROUNDED SUMMARY"
                  : "DETERMINISTIC FALLBACK"}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">
              {insight.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Map ----------------------------- */
function MapTab({
  snapshot,
  layers,
  setLayers,
  selectedEvent,
  setSelectedEvent,
}) {
  const toggle = (k) => setLayers((p) => ({ ...p, [k]: !p[k] }));
  const LAYERS = [
    { k: "weather", label: "Weather", c: "text-sky-300" },
    { k: "traffic", label: "Traffic", c: "text-amber-300" },
    { k: "transit", label: "Transit", c: "text-violet-300" },
    { k: "anomalies", label: "Anomalies", c: "text-rose-300" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <div className="lg:col-span-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {LAYERS.map((l) => (
            <button
              key={l.k}
              onClick={() => toggle(l.k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${layers[l.k] ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-500"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${layers[l.k] ? "bg-current " + l.c : "bg-slate-600"}`}
              />{" "}
              {l.label}
            </button>
          ))}
        </div>
        <div className="h-[560px] rounded-xl border border-slate-800">
          <CivicMap
            snapshot={snapshot}
            layers={layers}
            selectedZoneId={null}
            onSelectEvent={setSelectedEvent}
          />
        </div>
      </div>
      <div className="lg:col-span-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Event Details
        </div>
        {selectedEvent ? (
          <EventPanel event={selectedEvent} snapshot={snapshot} />
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
            Click any marker on the map to inspect an event and its related
            signals.
          </div>
        )}
      </div>
    </div>
  );
}

function EventPanel({ event, snapshot }) {
  const zone = snapshot.zones.find((v) => v.zone.id === event.zone_id);
  const corr = zone?.correlation;
  const s = sev(event.severity);
  const M = SOURCE_META[event.source];
  return (
    <div className={`mt-3 rounded-xl border ${s.ring} bg-slate-900/60 p-4`}>
      <div className="flex items-center gap-2">
        {M?.icon ? (
          <M.icon className={`h-4 w-4 ${M.color}`} />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <span className="font-semibold text-slate-100">{event.title}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <Row
          k="Type"
          v={`${M?.name || event.source} · ${event.event_type || "—"}`}
        />
        <Row
          k="Severity"
          v={<span className={`font-semibold ${s.text}`}>{s.label}</span>}
        />
        <Row k="Zone" v={zone?.zone.label + " · " + zone?.zone.name} />
        <Row k="Time" v={fmtTime(event.timestamp)} />
        {event.value != null && (
          <Row k="Value" v={`${event.value} ${event.unit || ""}`} />
        )}
        {event.metadata?.road && <Row k="Road" v={event.metadata.road} />}
        {event.metadata?.route && <Row k="Route" v={event.metadata.route} />}
      </div>
      {event.description && (
        <p className="mt-3 text-sm text-slate-400">{event.description}</p>
      )}
      {corr && (
        <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <div className="text-xs font-semibold text-sky-300">
            Possible relationship
          </div>
          <p className="mt-1 text-xs text-slate-300">{corr.explanation}</p>
          <div className="mt-2 text-xs text-slate-400">
            Confidence <b className="text-sky-300">{corr.confidence}%</b>
          </div>
        </div>
      )}
    </div>
  );
}
const Row = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-slate-500">{k}</span>
    <span className="text-right text-slate-200">{v}</span>
  </div>
);

/* ----------------------------- Intelligence ----------------------------- */
function Intelligence({ snapshot, correlation, insight }) {
  if (!correlation) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
        <Network className="mx-auto h-10 w-10 text-slate-600" />
        <div className="mt-3 font-semibold text-slate-200">
          No active correlations
        </div>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          The correlation engine surfaces links when multiple civic signals
          spike in the same zone and time window. Run the Zone-3 scenario to
          generate one.
        </p>
      </div>
    );
  }
  const ev = correlation.metadata?.evidence || correlation.evidence || [];
  const factors = correlation.metadata?.factors || correlation.factors || {};
  const win = correlation.metadata?.window || correlation.window;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 lg:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Correlation Pattern — {correlation.zoneLabel}
        </div>
        {/* visual tree */}
        <div className="mt-6 flex flex-col items-center">
          <Node color="sky" icon={CloudRain} label="HEAVY RAIN" />
          <Line />
          <div className="flex w-full items-start justify-center gap-8">
            <div className="flex flex-col items-center">
              <Node color="amber" icon={Car} label="TRAFFIC SPIKE" />
            </div>
            <div className="flex flex-col items-center">
              <Node color="violet" icon={Bus} label="TRANSIT DELAYS" />
            </div>
          </div>
          <Line />
          <Node
            color="rose"
            icon={Gauge}
            label={`${correlation.zoneLabel} CIVIC STRESS`}
          />
        </div>
      </div>

      <div className="space-y-4 lg:col-span-1">
        <div className="rounded-2xl border border-sky-500/30 bg-slate-900/50 p-5">
          <div className="flex items-end justify-between">
            <div className="text-sm font-semibold text-slate-200">
              Confidence
            </div>
            <div className="text-3xl font-extrabold text-sky-300">
              {correlation.confidence}%
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-700"
              style={{ width: `${correlation.confidence}%` }}
            />
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <FactorLine label="Location overlap" v={factors.location} />
            <FactorLine label="Time overlap" v={factors.time} />
            <FactorLine label="Anomaly strength" v={factors.anomaly} />
            <FactorLine label="Signal strength" v={factors.signal} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="text-sm font-semibold text-slate-200">Evidence</div>
          <div className="mt-3 space-y-2">
            {ev.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
              >
                <span className="text-slate-300">{e.label}</span>
                <span className="font-semibold text-slate-100">{e.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div>
              <div className="text-slate-500">Shared area</div>
              <div className="font-semibold text-slate-200">
                {correlation.zoneLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Shared time</div>
              <div className="font-semibold text-slate-200">
                {fmtTime(win?.start)} – {fmtTime(win?.end)}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            ⚠ Possible correlation — not confirmed causation.
          </div>
        </div>

        {insight && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
            <div className="mb-1 flex items-center gap-2 text-violet-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Grounded explanation
              </span>
            </div>
            <p className="text-sm text-slate-200">{insight.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
const FactorLine = ({ label, v }) => (
  <div className="flex items-center gap-2">
    <span className="w-32 text-slate-400">{label}</span>
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-sky-400"
        style={{ width: `${Math.round((v || 0) * 100)}%` }}
      />
    </div>
    <span className="w-8 text-right tabular-nums text-slate-300">
      {Math.round((v || 0) * 100)}
    </span>
  </div>
);
function Node({ color, icon: Icon, label }) {
  const tones = {
    sky: "border-sky-500/50 bg-sky-500/10 text-sky-300",
    amber: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    violet: "border-violet-500/50 bg-violet-500/10 text-violet-300",
    rose: "border-rose-500/50 bg-rose-500/10 text-rose-300",
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${tones[color]}`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-bold tracking-wide">{label}</span>
    </div>
  );
}
const Line = () => (
  <div className="my-3 h-8 w-px bg-gradient-to-b from-slate-600 to-slate-700" />
);

/* ----------------------------- Events / Timeline ----------------------------- */
function Events({ snapshot, selectedEvent, setSelectedEvent }) {
  const timeline = useMemo(() => {
    const evs = [...(snapshot.events || [])].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );
    return evs;
  }, [snapshot]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Chronological Event Timeline
        </div>
        <div className="relative ml-3 border-l border-slate-800 pl-6">
          {timeline.map((e) => {
            const M = SOURCE_META[e.source];
            const s = sev(e.severity);
            return (
              <button
                key={e.id}
                onClick={() => setSelectedEvent(e)}
                className={`relative mb-3 block w-full rounded-lg border ${selectedEvent?.id === e.id ? "border-sky-500/50 bg-slate-800/70" : "border-slate-800 bg-slate-900/50"} p-3 text-left hover:border-slate-700`}
              >
                <span
                  className={`absolute -left-[31px] top-4 h-3 w-3 rounded-full ${s.dot} ring-4 ring-slate-950`}
                />
                <div className="flex items-center gap-2">
                  {M?.icon && <M.icon className={`h-4 w-4 ${M.color}`} />}
                  <span className="text-sm font-semibold text-slate-100">
                    {e.title}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {fmtTime(e.timestamp)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {e.description}
                </div>
              </button>
            );
          })}
          {timeline.length === 0 && (
            <div className="text-sm text-slate-500">
              No events yet. Reset or play the scenario.
            </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Event Details
        </div>
        {selectedEvent ? (
          <EventPanel event={selectedEvent} snapshot={snapshot} />
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
            Select an event to see full details.
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Alerts ----------------------------- */
function Alerts({ snapshot, refresh }) {
  async function resolve(id) {
    await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    refresh();
  }
  const alerts = snapshot.alerts || [];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Alert Center
      </div>
      {alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
          <Bell className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          No alerts. The engine raises alerts when a correlation crosses the
          confidence threshold.
        </div>
      )}
      <div className="space-y-3">
        {alerts.map((a) => {
          const s = sev(a.severity);
          const resolved = a.status === "resolved";
          const zone = snapshot.zones.find((v) => v.zone.id === a.zone_id);
          return (
            <div
              key={a.id}
              className={`rounded-xl border ${resolved ? "border-slate-800 opacity-60" : s.ring} bg-slate-900/60 p-4`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${resolved ? "bg-slate-700 text-slate-300" : s.bg + " " + s.text}`}
                >
                  {resolved ? "RESOLVED" : s.label}
                </span>
                <span className="font-semibold text-slate-100">{a.title}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {fmtTime(a.created_at)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                <MapPin className="h-3 w-3" /> {zone?.zone.label || "City"} —{" "}
                {zone?.zone.name}
              </div>
              <p className="mt-2 text-sm text-slate-300">{a.message}</p>
              {!resolved && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => resolve(a.id)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- Replay ----------------------------- */
function Replay({ snapshot }) {
  const events = useMemo(
    () =>
      [...(snapshot.events || [])].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      ),
    [snapshot],
  );
  const [idx, setIdx] = useState(events.length);
  const [playing, setPlaying] = useState(false);
  const ref = useRef(false);
  useEffect(() => {
    setIdx(events.length);
  }, [events.length]);

  async function play() {
    if (ref.current) return;
    ref.current = true;
    setPlaying(true);
    setIdx(0);
    for (let i = 1; i <= events.length; i++) {
      await new Promise((r) => setTimeout(r, 350));
      if (!ref.current) break;
      setIdx(i);
    }
    ref.current = false;
    setPlaying(false);
  }
  const shown = events.slice(0, idx);
  const cursorTime = events[Math.max(0, idx - 1)]?.timestamp;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Historical Replay
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          DEMO REPLAY
        </span>
        <button
          onClick={play}
          disabled={playing || !events.length}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> {playing ? "Replaying…" : "Play"}
        </button>
      </div>
      <input
        type="range"
        min="0"
        max={events.length}
        value={idx}
        onChange={(e) => setIdx(Number(e.target.value))}
        className="mt-4 w-full accent-sky-400"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{fmtTime(events[0]?.timestamp)}</span>
        <span className="font-semibold text-sky-300">
          {fmtTime(cursorTime)}
        </span>
        <span>{fmtTime(events[events.length - 1]?.timestamp)}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown
          .slice(-9)
          .reverse()
          .map((e) => {
            const M = SOURCE_META[e.source];
            const s = sev(e.severity);
            return (
              <div
                key={e.id}
                className={`rounded-lg border ${s.ring} bg-slate-900/60 p-2.5`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  {M?.icon && <M.icon className={`h-3.5 w-3.5 ${M.color}`} />}
                  <span className="truncate font-medium text-slate-200">
                    {e.title}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {fmtTime(e.timestamp)}
                </div>
              </div>
            );
          })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Scrub or press Play to watch how the civic pattern develops over time
        using stored synthetic data.
      </p>
    </div>
  );
}

export default App;
