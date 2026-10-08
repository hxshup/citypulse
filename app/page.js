"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Search,
  Newspaper,
  ExternalLink,
  Languages,
  LoaderCircle,
  LocateFixed,
  Building2,
  MapPinned,
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
  Ambulance,
  Hospital,
  ArrowUpRight,
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
        pulse:
          zv.eventCount === 0
            ? { score: null, factors: { weather: null, traffic: null, transit: null, incidents: null } }
            : zv.pulse,
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
    pulse:
      snapshot.events.filter((event) => event.status === "active").length === 0
        ? { score: null, factors: { weather: null, traffic: null, transit: null, incidents: null } }
        : { score: snapshot.city.pulse, factors: snapshot.city.factors },
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
  const hasScore = Number.isFinite(score);
  const R = 76,
    C = 2 * Math.PI * R;
  const off = hasScore ? C - (score / 100) * C : C;
  return (
    <div className="relative h-36 w-36 shrink-0 sm:h-48 sm:w-48">
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
          stroke={hasScore ? pulseStroke(score) : "#334155"}
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
          className={`text-5xl font-extrabold tabular-nums ${hasScore ? pulseColor(score) : "text-slate-400"}`}
        >
          {hasScore ? score : "—"}
        </div>
        <div className="text-xs uppercase tracking-widest text-slate-500">
          {hasScore ? "/ 100" : "NO DATA"}
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
        <span className={`font-semibold tabular-nums ${Number.isFinite(value) ? pulseColor(value) : "text-slate-500"}`}>
          {Number.isFinite(value) ? value : "—"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Number.isFinite(value) ? value : 0}%`, background: Number.isFinite(value) ? pulseStroke(value) : "transparent" }}
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
      className={`cp-panel rounded-xl border ${s.ring} bg-slate-900/60 p-4 backdrop-blur`}
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

function Reveal({ children, className, delay = 0 }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.32,
        delay: prefersReducedMotion ? 0 : delay,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.div>
  );
}

const COPY = {
  en: {
    overview: "Overview",
    map: "City atlas",
    intelligence: "Intelligence",
    events: "Events",
    alerts: "Alerts",
    replay: "Replay",
    liveBriefing: "Live city briefing",
    intelligenceDesk: "City intelligence",
    cityTitle: "Jaipur, in real time",
    cityDescription: "Local weather, city headlines, and civic signals—focused on the place you choose.",
    monitoring: "Monitoring live",
    loadingSources: "Connecting to sources",
    noSources: "Live sources unavailable",
    searchPlaceholder: "Search a Jaipur area, landmark, or hospital",
    searchHint: "Search any neighbourhood or place in Jaipur",
    searching: "Searching Jaipur…",
    noResults: "No matching Jaipur places found.",
    chooseArea: "Choose an area to focus your briefing",
    selectedArea: "Area briefing",
    observedWeather: "Current weather",
    temperature: "Temperature",
    rain: "Rain",
    wind: "Wind",
    recentHeadlines: "Recent local headlines",
    incidentsInNews: "Incident-related news mentions",
    noHeadlines: "No recent headlines were found for this place.",
    liveTraffic: "Live road traffic",
    trafficNotConfigured: "Traffic provider not configured",
    trafficSetup: "Configure TOMTOM_API_KEY on the server to enable live road speeds.",
    trafficUnavailable: "No traffic reading is available for this location right now.",
    placeAtlas: "Jaipur places & neighbourhoods",
    placeAtlasDescription: "Browse mapped neighbourhoods, hospitals, and notable places from OpenStreetMap.",
    allPlaces: "All places",
    popularPlaces: "Places across Jaipur",
    area: "Area",
    areas: "Areas",
    hospitals: "Hospitals",
    landmarks: "Landmarks",
    loadingPlaces: "Loading Jaipur places…",
    noPlaces: "No mapped places were returned. Try searching for a specific location.",
    sourceNote: "OpenStreetMap place data · © OpenStreetMap contributors",
    simulatedDemo: "Play demo scenario",
    noSignalData: "No civic reports recorded",
    noSignalDetail: "CityPulse has no current incident feed for this area. Weather, traffic, and news below come from separate live public sources.",
    scenarioPulseNote: "When present, this score is calculated only from CityPulse's recorded or demo scenario events. It is not a citywide safety rating.",
    nextStep: "Next",
    scenarioStep: "Demo step",
    sourceUnavailable: "This source is temporarily unavailable.",
    liveIncident: "Civic event wire",
    recordedEvents: "Demo / recorded events",
    activeSignals: "Active Signals",
    civicPulse: "Civic Pulse · Demo model",
    weather: "Weather",
    traffic: "Traffic",
    transit: "Transit",
    incidents: "Incidents",
    nominalSignals: "All signals nominal",
    detectedCorrelation: "Possible Correlation Detected",
    correlationDisclaimer: "Possible correlation — not confirmed causation.",
    medicalWatch: "Medical response watch",
    emergencyDatasetNotice: "Event mentions from stored civic reports; this is not an emergency dispatch service.",
    nearestResponse: "Nearest mapped hospital",
    highSeverityWatch: "High severity watch",
    activeCases: "active cases",
    eventDetails: "Event details",
    selectMapMarker: "Select a map marker to inspect its details.",
    layerWeather: "Weather",
    layerTraffic: "Traffic",
    layerTransit: "Transit",
    layerAnomalies: "Anomalies",
    noActiveCorrelations: "No active correlations",
    chronologicalTimeline: "Chronological event timeline",
    alertCenter: "Alert center",
    markResolved: "Mark resolved",
    historicalReplay: "Historical replay",
    loadingCivic: "Loading civic signals…",
    dataErrorTitle: "Could not reach the data layer",
    dataErrorHint: "Ensure the local SQLite file is writable, or configure",
    wholeCity: "Whole City",
    activeUpdates: "active updates",
    noLiveIncidents: "No active incidents in the live wire.",
    noMappedHospital: "No mapped hospital nearby",
    approximate: "Approx.",
    activeEvents: "active events",
    noEmergencyReports: "No emergency-related reports in this dataset.",
    noWeatherReport: "No weather report in this dataset",
    heavyRain: "Heavy rainfall",
    clearRain: "Clear",
    humidity: "Humidity",
    rainfall: "Rainfall",
    recordedIncidents: "recorded incidents",
    noTrafficReports: "No traffic reports recorded",
    recordedRouteDelays: "recorded route delays",
    noTransitReports: "No transit delay reports",
    averageDelay: "avg delay",
    highSeverityReports: "high-severity reports",
    noHighSeverityReports: "No high-severity reports",
    incidentResolved: "Incident Resolved",
    incidentDetected: "Incident Detected",
    unknownZone: "Unknown Zone",
    confidence: "confidence",
    minOverlap: "min overlap",
    explorePattern: "Explore Pattern",
    noCorrelationDescription: "The correlation engine surfaces links when multiple civic signals spike in the same zone and time window. Run the demo scenario to generate one.",
    correlationPattern: "Correlation Pattern",
    locationOverlap: "Location overlap",
    timeOverlap: "Time overlap",
    anomalyStrength: "Anomaly strength",
    signalStrength: "Signal strength",
    evidence: "Evidence",
    sharedArea: "Shared area",
    sharedTime: "Shared time",
    groundedExplanation: "Grounded explanation",
    selectEventDetails: "Select an event to see full details.",
    resolved: "RESOLVED",
    noAlerts: "No alerts. The engine raises alerts when a correlation crosses the confidence threshold.",
    demoReplay: "DEMO REPLAY",
    replaying: "Replaying…",
    play: "Play",
    replayDescription: "Scrub or press Play to watch how the civic pattern develops over time using stored demo data.",
    freeFlow: "Free-flow",
    providerConfidence: "provider confidence",
    nearestRoad: "nearest road segment",
    emergencyDisclaimer: "Traffic reports and nearby event mentions are not emergency dispatch data.",
    incidentUpdates: "active updates",
    scenarioNormal: "Scenario started — normal city state",
    liveScoresRefreshed: "Live civic scores refreshed",
  },
  hi: {
    overview: "अवलोकन",
    map: "शहर मानचित्र",
    intelligence: "विश्लेषण",
    events: "घटनाएँ",
    alerts: "अलर्ट",
    replay: "रीप्ले",
    liveBriefing: "शहर की ताज़ा जानकारी",
    intelligenceDesk: "शहर विश्लेषण",
    cityTitle: "जयपुर, हर पल",
    cityDescription: "आपके चुने हुए क्षेत्र का मौसम, शहर की खबरें और नागरिक संकेत।",
    monitoring: "लाइव निगरानी",
    loadingSources: "डेटा स्रोतों से जुड़ रहे हैं",
    noSources: "लाइव स्रोत उपलब्ध नहीं",
    searchPlaceholder: "जयपुर का क्षेत्र, प्रसिद्ध जगह या अस्पताल खोजें",
    searchHint: "जयपुर का कोई भी इलाका या जगह खोजें",
    searching: "जयपुर में खोज रहे हैं…",
    noResults: "जयपुर में कोई मेल खाती जगह नहीं मिली।",
    chooseArea: "जानकारी देखने के लिए क्षेत्र चुनें",
    selectedArea: "क्षेत्र की जानकारी",
    observedWeather: "मौजूदा मौसम",
    temperature: "तापमान",
    rain: "बारिश",
    wind: "हवा",
    recentHeadlines: "हाल की स्थानीय खबरें",
    incidentsInNews: "खबरों में घटना संबंधी उल्लेख",
    noHeadlines: "इस जगह के लिए हाल की खबरें नहीं मिलीं।",
    liveTraffic: "सड़क यातायात",
    trafficNotConfigured: "यातायात सेवा सेट नहीं है",
    trafficSetup: "लाइव सड़क गति के लिए सर्वर पर TOMTOM_API_KEY सेट करें।",
    trafficUnavailable: "अभी इस जगह के लिए यातायात जानकारी उपलब्ध नहीं है।",
    placeAtlas: "जयपुर के क्षेत्र और प्रमुख जगहें",
    placeAtlasDescription: "OpenStreetMap से क्षेत्र, अस्पताल और दर्शनीय स्थल देखें।",
    allPlaces: "सभी जगहें",
    popularPlaces: "जयपुर की प्रमुख जगहें",
    area: "क्षेत्र",
    areas: "क्षेत्र",
    hospitals: "अस्पताल",
    landmarks: "प्रमुख स्थल",
    loadingPlaces: "जयपुर की जगहें लोड हो रही हैं…",
    noPlaces: "मानचित्र पर जगहें नहीं मिलीं। कोई स्थान खोजकर देखें।",
    sourceNote: "OpenStreetMap स्थान डेटा · © OpenStreetMap योगदानकर्ता",
    simulatedDemo: "डेमो परिदृश्य चलाएँ",
    noSignalData: "नागरिक रिपोर्ट उपलब्ध नहीं",
    noSignalDetail: "इस क्षेत्र के लिए CityPulse में अभी घटना फ़ीड नहीं है। नीचे का मौसम, यातायात और समाचार अलग सार्वजनिक स्रोतों से हैं।",
    scenarioPulseNote: "यह स्कोर केवल CityPulse में दर्ज या डेमो परिदृश्य की घटनाओं से निकलता है; यह पूरे शहर की सुरक्षा रेटिंग नहीं है।",
    nextStep: "अगला",
    scenarioStep: "डेमो चरण",
    sourceUnavailable: "यह स्रोत अभी उपलब्ध नहीं है।",
    liveIncident: "नागरिक घटना सूची",
    recordedEvents: "डेमो / दर्ज घटनाएँ",
    activeSignals: "सक्रिय संकेत",
    civicPulse: "सिविक पल्स · डेमो मॉडल",
    weather: "मौसम",
    traffic: "यातायात",
    transit: "सार्वजनिक परिवहन",
    incidents: "घटनाएँ",
    nominalSignals: "सभी संकेत सामान्य",
    detectedCorrelation: "संभावित संबंध मिला",
    correlationDisclaimer: "संभावित संबंध—कारण की पुष्टि नहीं।",
    medicalWatch: "चिकित्सा सहायता की जानकारी",
    emergencyDatasetNotice: "दर्ज नागरिक रिपोर्टों में उल्लेख; यह आपातकालीन सेवा नहीं है।",
    nearestResponse: "निकटतम मानचित्रित अस्पताल",
    highSeverityWatch: "उच्च गंभीरता निगरानी",
    activeCases: "सक्रिय मामले",
    eventDetails: "घटना का विवरण",
    selectMapMarker: "विवरण देखने के लिए मानचित्र पर कोई निशान चुनें।",
    layerWeather: "मौसम",
    layerTraffic: "यातायात",
    layerTransit: "परिवहन",
    layerAnomalies: "असामान्य संकेत",
    noActiveCorrelations: "कोई सक्रिय संबंध नहीं",
    chronologicalTimeline: "घटनाओं का समयक्रम",
    alertCenter: "अलर्ट केंद्र",
    markResolved: "हल हुआ चिह्नित करें",
    historicalReplay: "पुरानी घटनाएँ",
    loadingCivic: "नागरिक संकेत लोड हो रहे हैं…",
    dataErrorTitle: "डेटा सेवा से संपर्क नहीं हो पाया",
    dataErrorHint: "स्थानीय SQLite फ़ाइल लिखने योग्य होनी चाहिए, या यह कॉन्फ़िगर करें",
    wholeCity: "पूरा शहर",
    activeUpdates: "सक्रिय अपडेट",
    noLiveIncidents: "लाइव फ़ीड में कोई सक्रिय घटना नहीं है।",
    noMappedHospital: "पास में मानचित्रित अस्पताल नहीं मिला",
    approximate: "लगभग",
    activeEvents: "सक्रिय घटनाएँ",
    noEmergencyReports: "इस डेटासेट में आपातकालीन रिपोर्ट नहीं हैं।",
    noWeatherReport: "इस डेटासेट में मौसम रिपोर्ट नहीं है",
    heavyRain: "भारी बारिश",
    clearRain: "साफ़",
    humidity: "नमी",
    rainfall: "वर्षा",
    recordedIncidents: "दर्ज घटनाएँ",
    noTrafficReports: "यातायात रिपोर्ट दर्ज नहीं",
    recordedRouteDelays: "दर्ज मार्ग विलंब",
    noTransitReports: "परिवहन विलंब रिपोर्ट नहीं",
    averageDelay: "औसत विलंब",
    highSeverityReports: "उच्च गंभीरता रिपोर्ट",
    noHighSeverityReports: "उच्च गंभीरता रिपोर्ट नहीं",
    incidentResolved: "घटना हल हुई",
    incidentDetected: "घटना दर्ज हुई",
    unknownZone: "अज्ञात क्षेत्र",
    confidence: "विश्वसनीयता",
    minOverlap: "मिनट का मेल",
    explorePattern: "पैटर्न देखें",
    noCorrelationDescription: "सहसंबंध इंजन एक ही क्षेत्र और समय में कई नागरिक संकेत बढ़ने पर संभावित संबंध दिखाता है। इसे देखने के लिए डेमो चलाएँ।",
    correlationPattern: "सहसंबंध पैटर्न",
    locationOverlap: "स्थान का मेल",
    timeOverlap: "समय का मेल",
    anomalyStrength: "असामान्य संकेत की तीव्रता",
    signalStrength: "संकेत की तीव्रता",
    evidence: "साक्ष्य",
    sharedArea: "साझा क्षेत्र",
    sharedTime: "साझा समय",
    groundedExplanation: "स्रोत-आधारित व्याख्या",
    selectEventDetails: "पूरी जानकारी के लिए कोई घटना चुनें।",
    resolved: "हल हुआ",
    noAlerts: "अभी कोई अलर्ट नहीं है। सहसंबंध विश्वास सीमा पार करने पर इंजन अलर्ट जारी करता है।",
    demoReplay: "डेमो रीप्ले",
    replaying: "दोबारा चल रहा है…",
    play: "चलाएँ",
    replayDescription: "डेमो डेटा में नागरिक पैटर्न का समयानुसार विकास देखने के लिए स्लाइडर खिसकाएँ या चलाएँ दबाएँ।",
    freeFlow: "खुली सड़क गति",
    providerConfidence: "प्रदाता विश्वास",
    nearestRoad: "निकटतम सड़क खंड",
    emergencyDisclaimer: "यातायात रिपोर्ट और पास की घटनाओं के उल्लेख आपातकालीन सेवा डेटा नहीं हैं।",
    incidentUpdates: "सक्रिय अपडेट",
    scenarioNormal: "परिदृश्य शुरू हुआ — शहर की सामान्य स्थिति",
    liveScoresRefreshed: "नागरिक स्कोर रीफ़्रेश हुए",
  },
};

function copy(language, key) {
  return COPY[language]?.[key] || COPY.en[key] || key;
}

function CityAreaSearch({ language, onChoose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) {
      setResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/jaipur/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Place search is unavailable.");
        setResults(data);
      } catch (error) {
        if (error.name !== "AbortError") setSearchError(error.message);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 550);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="relative z-10 w-full">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) {
            onChoose(results[0]);
            setQuery(results[0].name);
            setResults([]);
          }
        }}
        className="flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/85 p-2 shadow-xl shadow-black/20 transition focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/15"
      >
        <Search className="ml-2 h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy(language, "searchPlaceholder")}
          aria-label={copy(language, "searchPlaceholder")}
          aria-autocomplete="list"
          aria-controls="jaipur-place-results"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          maxLength={80}
        />
        {searching && <LoaderCircle className="h-4 w-4 animate-spin text-sky-300" aria-label={copy(language, "searching")} />}
        <span className="hidden pr-3 text-[11px] text-slate-500 sm:inline">{copy(language, "searchHint")}</span>
      </form>
      {(results.length > 0 || (query.trim().length >= 3 && !searching && searchError)) && (
        <div
          id="jaipur-place-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        >
          {searchError ? (
            <p className="px-4 py-3 text-sm text-rose-300">{searchError}</p>
          ) : results.length ? (
            results.map((place) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={place.id}
                onClick={() => {
                  onChoose(place);
                  setQuery(place.name);
                  setResults([]);
                }}
                className="flex w-full items-start gap-3 border-b border-slate-800 px-4 py-3 text-left last:border-0 hover:bg-slate-800"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-100">{place.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">{place.displayName}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-slate-400">{copy(language, "noResults")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AreaBriefing({ area, briefing, loading, error, language }) {
  const weather = briefing?.weather;
  const traffic = briefing?.traffic;
  const news = briefing?.news;
  const weatherCondition =
    language === "hi"
      ? {
          "Clear sky": "साफ आसमान",
          "Mainly clear": "मुख्यतः साफ",
          "Partly cloudy": "आंशिक बादल",
          Overcast: "बादल छाए",
          Fog: "कोहरा",
          Drizzle: "बूंदाबांदी",
          Rain: "बारिश",
          Snow: "बर्फ़बारी",
          Thunderstorm: "आंधी-तूफ़ान",
        }[weather?.condition] || weather?.condition
      : weather?.condition;

  return (
    <section className="cp-panel mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="min-w-0">
          <p className="cp-eyebrow">{copy(language, "selectedArea")}</p>
          <h2 className="mt-1 truncate text-lg font-semibold text-white">{area.name}</h2>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-slate-400">
          {loading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-sky-300" />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${briefing ? "bg-emerald-400" : "bg-amber-400"}`} />
          )}
          {loading ? copy(language, "searching") : briefing ? `${briefing.area.name} · ${fmtTime(briefing.asOf)}` : copy(language, "sourceUnavailable")}
        </span>
      </div>
      {error && <p role="status" className="px-5 pt-4 text-sm text-amber-300">{error}</p>}
      <div className="grid grid-cols-1 gap-px bg-slate-800/80 md:grid-cols-3">
        <section className="bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <CloudRain className="h-4 w-4 text-sky-300" />
            {copy(language, "observedWeather")}
          </div>
          {weather?.status === "live" ? (
            <>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-white">{weather.temperatureC}°</span>
                <span className="text-sm text-slate-400">{weatherCondition}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div><span className="block text-slate-500">{copy(language, "temperature")}</span><b className="mt-1 block text-slate-200">{weather.feelsLikeC}°C feels like</b></div>
                <div><span className="block text-slate-500">{copy(language, "rain")}</span><b className="mt-1 block text-slate-200">{weather.precipitationMm} mm</b></div>
                <div><span className="block text-slate-500">{copy(language, "wind")}</span><b className="mt-1 block text-slate-200">{weather.windKph} km/h</b></div>
              </div>
              <p className="mt-4 text-[11px] text-slate-500">{weather.attribution} · {fmtTime(weather.observedAt)}</p>
            </>
          ) : <p className="mt-4 text-sm text-slate-400">{weather?.message || copy(language, "sourceUnavailable")}</p>}
        </section>
        <section className="bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Newspaper className="h-4 w-4 text-violet-300" />
            {copy(language, "recentHeadlines")}
          </div>
          {news?.status === "live" ? (
            <div className="mt-3 space-y-2">
              {news.news.slice(0, 4).map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-2 rounded-lg border border-transparent px-2 py-2 text-sm leading-snug text-slate-300 transition hover:border-slate-700 hover:bg-slate-800/70 hover:text-white"
                >
                  <span className="line-clamp-2 flex-1">{item.title}</span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-sky-300" />
                </a>
              ))}
              {!news.news.length && <p className="px-2 py-2 text-sm text-slate-400">{copy(language, "noHeadlines")}</p>}
            </div>
          ) : <p className="mt-4 text-sm text-slate-400">{news?.message || copy(language, "sourceUnavailable")}</p>}
          <p className="mt-3 px-2 text-[11px] text-slate-500">{news?.attribution || "Google News RSS · headlines link to publishers"}</p>
          {briefing?.incidents?.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">{copy(language, "incidentsInNews")}</p>
              {briefing.incidents.slice(0, 2).map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block line-clamp-2 text-xs text-slate-300 underline decoration-slate-700 underline-offset-2 hover:text-amber-200"
                >
                  {item.title}
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Car className="h-4 w-4 text-amber-300" />
            {copy(language, "liveTraffic")}
          </div>
          {traffic?.status === "live" ? (
            <>
              <div className="mt-4 text-4xl font-semibold tracking-tight text-white">{traffic.currentSpeedKph}<span className="ml-1 text-base font-medium text-slate-400">km/h</span></div>
              <p className="mt-2 text-sm text-slate-400">{copy(language, "freeFlow")} {traffic.freeFlowSpeedKph} km/h · {Math.round(traffic.confidence * 100)}% {copy(language, "providerConfidence")}</p>
              <p className="mt-3 text-[11px] text-slate-500">{traffic.source} · {copy(language, "nearestRoad")}</p>
            </>
          ) : traffic?.status === "not_configured" ? (
            <>
              <p className="mt-4 text-sm text-amber-200">{copy(language, "trafficNotConfigured")}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{copy(language, "trafficSetup")}</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{traffic?.message || copy(language, "trafficUnavailable")}</p>
          )}
          <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
            {copy(language, "emergencyDisclaimer")}
          </p>
        </section>
      </div>
    </section>
  );
}

function eventAge(timestamp) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 60000),
  );
  return minutes < 1 ? "Just now" : `${minutes} min ago`;
}

function LiveIncidentStrip({ snapshot, language }) {
  const incidents = (snapshot.events || [])
    .filter(
      (event) =>
        event.status === "active" &&
        (event.source !== "weather" || event.severity !== "low"),
    )
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  return (
    <section className="cp-panel overflow-hidden rounded-2xl border border-sky-500/25 bg-slate-900/70 lg:col-span-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Radio className="h-4 w-4 text-rose-400" /> {copy(language, "liveIncident")}
        </div>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
          {copy(language, "recordedEvents")}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {incidents.length} {copy(language, "incidentUpdates")}
        </span>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto p-3">
        {incidents.length ? (
          incidents.map((event) => {
            const severity = sev(event.severity);
            const zone = snapshot.zones.find(
              (item) => item.zone.id === event.zone_id,
            );
            return (
              <div
                key={event.id}
                className="min-w-[245px] snap-start rounded-xl border border-slate-800 bg-slate-950/70 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${severity.text}`}
                  >
                    {severity.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {eventAge(event.timestamp)}
                  </span>
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-slate-100">
                  {event.title}
                </div>
                <div className="mt-1 truncate text-xs text-slate-400">
                  {zone?.zone.name || "Jaipur"} · {event.description}
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-2 py-2 text-sm text-slate-500">
            {copy(language, "noLiveIncidents")}
          </div>
        )}
      </div>
    </section>
  );
}

function MedicalResponse({ snapshot, places, focusedArea, language }) {
  const medicalEvents = (snapshot.events || [])
    .filter(
      (event) =>
        event.status === "active" &&
        (event.source === "medical" ||
          event.event_type === "medical" ||
          /ambulance|medical|injur|collision|emergency/i.test(
            `${event.title} ${event.description}`,
          )),
    )
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const highSeverity = (snapshot.events || []).filter(
    (event) => event.status === "active" && event.severity === "high",
  ).length;
  const activeCases = medicalEvents.length;
  const nearestHospital = places
    .filter((place) => place.category === "hospital")
    .reduce((nearest, place) => {
      const distance = Math.hypot(
        (place.latitude - focusedArea.latitude) * 111.32,
        (place.longitude - focusedArea.longitude) *
          111.32 *
          Math.cos((focusedArea.latitude * Math.PI) / 180),
      );
      return !nearest || distance < nearest.distance
        ? { place, distance }
        : nearest;
    }, null);

  return (
    <div className="cp-panel mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-rose-300">
            <Ambulance className="h-5 w-5" />
            <span className="text-sm font-bold uppercase tracking-wide">
              {copy(language, "medicalWatch")}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {copy(language, "emergencyDatasetNotice")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold tabular-nums text-rose-300">
            {activeCases}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            {copy(language, "activeCases")}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <Hospital className="mb-1 h-4 w-4 text-sky-300" />
          <span className="text-slate-400">{copy(language, "nearestResponse")}</span>
          <div className="mt-1 font-semibold text-slate-200">
            {nearestHospital?.place.name || copy(language, "noMappedHospital")}
          </div>
          {nearestHospital && (
            <div className="mt-1 text-[10px] text-slate-500">
              {copy(language, "approximate")} {nearestHospital.distance.toFixed(1)} km · OpenStreetMap
            </div>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <Clock className="mb-1 h-4 w-4 text-amber-300" />
          <span className="text-slate-400">{copy(language, "highSeverityWatch")}</span>
          <div className="mt-1 font-semibold text-slate-200">
            {highSeverity} {copy(language, "activeEvents")}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {medicalEvents.slice(0, 2).map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2 text-xs"
          >
            <span className="truncate text-slate-300">{event.title}</span>
            <span className="shrink-0 text-slate-500">
              {eventAge(event.timestamp)}
            </span>
          </div>
        ))}
        {!medicalEvents.length && (
          <div className="border-t border-slate-800 pt-2 text-xs text-emerald-300">
            {copy(language, "noEmergencyReports")}
          </div>
        )}
      </div>
    </div>
  );
}

function LandmarkGrid({ places, loading, onSelectPlace, language }) {
  const notablePlaces = places
    .filter((place) => place.category !== "area")
    .slice(0, 8);
  return (
    <section className="lg:col-span-3">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="cp-eyebrow">{copy(language, "popularPlaces")}</div>
          <p className="mt-1 text-sm text-slate-500">{copy(language, "placeAtlasDescription")}</p>
        </div>
        <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
          <MapPin className="h-3 w-3" /> © OpenStreetMap
        </span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
          <LoaderCircle className="h-4 w-4 animate-spin text-sky-300" />
          {copy(language, "loadingPlaces")}
        </div>
      ) : notablePlaces.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {notablePlaces.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => onSelectPlace(place)}
              className="cp-panel rounded-2xl border border-slate-800 bg-slate-900/55 p-4 text-left hover:border-sky-500/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-100">{place.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {copy(language, place.category === "hospital" ? "hospitals" : "landmarks")}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600" />
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-sky-300" />
                {place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
          {copy(language, "noPlaces")}
        </p>
      )}
    </section>
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
  const prefersReducedMotion = useReducedMotion();
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
  const [language, setLanguage] = useState("en");
  const [focusedArea, setFocusedArea] = useState({
    name: "Jaipur",
    latitude: 26.9124,
    longitude: 75.7873,
    source: "City centre",
  });
  const [areaBriefing, setAreaBriefing] = useState(null);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [cityPlaces, setCityPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const placesRequestedRef = useRef(false);
  const previousEventsRef = useRef(new Map());
  const [layers, setLayers] = useState({
    weather: true,
    traffic: true,
    transit: true,
    anomalies: true,
  });
  const playRef = useRef(false);

  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem("citypulse-language");
      if (savedLanguage === "hi" || savedLanguage === "en") {
        setLanguage(savedLanguage);
      }
    } catch (error) {
      console.warn("Language preference could not be restored.", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("citypulse-language", language);
    } catch (error) {
      console.warn("Language preference could not be saved.", error);
    }
  }, [language]);

  useEffect(() => {
    if (!focusedArea) return undefined;
    const controller = new AbortController();
    let mounted = true;
    const refreshBriefing = async () => {
      setAreaLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(focusedArea.latitude),
          lon: String(focusedArea.longitude),
          name: focusedArea.name,
          language,
        });
        const response = await fetch(`/api/jaipur/area?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this area.");
        if (mounted) {
          setAreaBriefing(data);
          setAreaError("");
        }
      } catch (error) {
        if (mounted && error.name !== "AbortError") {
          setAreaError(error.message || copy(language, "sourceUnavailable"));
        }
      } finally {
        if (mounted) setAreaLoading(false);
      }
    };
    refreshBriefing();
    const interval = setInterval(refreshBriefing, 5 * 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
      controller.abort();
    };
  }, [focusedArea, language]);

  useEffect(() => {
    if (placesRequestedRef.current) return undefined;
    const controller = new AbortController();
    placesRequestedRef.current = true;
    setPlacesLoading(true);
    fetch("/api/jaipur/places?group=all", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load Jaipur places.");
        if (controller.signal.aborted) return;
        setCityPlaces(data.places || []);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setPlacesError(error.message || copy(language, "sourceUnavailable"));
          placesRequestedRef.current = false;
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlacesLoading(false);
      });
    return () => {
      controller.abort();
      if (!cityPlaces.length) placesRequestedRef.current = false;
    };
  }, [cityPlaces.length]);

  const fetchState = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch("/api/state", {
        cache: "no-store",
        signal: controller.signal,
      });
      const d = await r.json().catch(() => ({}));
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
      setErr(
        e.name === "AbortError"
          ? "The civic data service did not respond within 12 seconds."
          : e.message || "Failed to load civic data",
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 30000);
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
      flash(copy(language, "liveScoresRefreshed"));
    } finally {
      setBusy(false);
    }
  }
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
    flash(copy(language, "scenarioNormal"));
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
  const chooseArea = (place) => {
    setAreaBriefing(null);
    setAreaError("");
    setFocusedArea({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      source: place.source || "OpenStreetMap",
    });
  };
  const setDashboardLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
  };

  return (
    <div
      className="min-h-screen bg-[#070b14] text-slate-100"
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
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
          <div className="min-w-0 flex items-center gap-2">
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
              <div className="truncate text-lg font-extrabold tracking-tight">
                CITYPULSE
              </div>
              <div className="text-[11px] text-slate-400">
                Live Civic Intelligence
              </div>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1 text-xs font-semibold text-emerald-300">
              <span className={`h-1.5 w-1.5 rounded-full ${areaBriefing?.weather?.status === "live" || areaBriefing?.news?.status === "live" ? "bg-emerald-400" : "bg-amber-400"}`}>
              </span>
              {areaLoading ? (language === "hi" ? "जुड़ रहा है" : "CONNECTING") : areaBriefing?.sources?.length ? (language === "hi" ? "लाइव स्रोत" : "LIVE SOURCES") : (language === "hi" ? "स्रोत उपलब्ध नहीं" : "SOURCES OFFLINE")}
            </span>
            <Chip tone="slate">
              <MapPin className="h-3 w-3" /> {snapshot?.city?.name || "Jaipur"}
            </Chip>
            <Chip tone="slate">
              <Clock className="h-3 w-3" /> {fmtTime(snapshot?.lastUpdated)}
            </Chip>
            <button
              type="button"
              onClick={() => setDashboardLanguage(language === "en" ? "hi" : "en")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500/50 hover:text-white"
              aria-label={language === "en" ? "Switch to Hindi" : "Switch to English"}
              aria-pressed={language === "hi"}
            >
              <Languages className="h-3.5 w-3.5 text-sky-300" />
              {language === "en" ? "हिंदी" : "EN"}
            </button>
          </div>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            {(areaBriefing?.sources || []).map((source) => (
              <span key={source} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-300">
                <CircleDot className="h-3 w-3 text-emerald-400" /> {source}
              </span>
            ))}
          </div>

          <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="mr-1 hidden text-xs text-slate-400 sm:block">
              {copy(language, "scenarioStep")}{" "}
              <span className="font-bold text-slate-200">{step}/5</span>
            </div>
            <button
              onClick={doPlay}
              disabled={busy || playing}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 px-2 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 disabled:opacity-50 sm:flex-none sm:px-3"
            >
              <Play className="h-4 w-4" />{" "}
              {playing ? "Playing…" : copy(language, "simulatedDemo")}
            </button>
            <button
              onClick={doAdvance}
              disabled={busy || playing || step >= 5}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 sm:px-3"
            >
              <SkipForward className="h-4 w-4" /> {copy(language, "nextStep")}
            </button>
          </div>
        </div>
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
                <t.icon className="h-4 w-4" /> {copy(language, t.id)}
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
      <AnimatePresence>
      {mobileMenuOpen && (
        <motion.div
          key="mobile-navigation"
          className="fixed inset-0 z-40 sm:hidden"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <motion.aside
            className="absolute left-0 top-0 z-10 h-full w-72 border-r border-slate-800 bg-slate-950 shadow-2xl"
            initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
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
                    <span>{copy(language, t.id)}</span>
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
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>
      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {loading && (
          <div className="flex h-64 items-center justify-center text-slate-400">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> {copy(language, "loadingCivic")}
          </div>
        )}
        {!loading && err && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-200">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5" /> {copy(language, "dataErrorTitle")}
            </div>
            <p className="text-sm">{err}</p>
            <p className="mt-2 text-sm text-amber-300/80">
              {copy(language, "dataErrorHint")}{" "}
              <code>CITYPULSE_DB_PATH</code> to a writable path.
            </p>
          </div>
        )}

        {!loading && !err && snapshot && (
          <>
            <section className="mb-6 flex flex-col gap-4 border-b border-slate-800/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="cp-eyebrow">
                  {copy(language, tab === "overview" ? "liveBriefing" : "intelligenceDesk")}
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {tab === "overview" ? copy(language, "cityTitle") : copy(language, tab)}
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
                  {tab === "overview"
                    ? copy(language, "cityDescription")
                    : copy(language, "placeAtlasDescription")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-emerald-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${areaBriefing?.sources?.length ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {areaLoading
                    ? copy(language, "loadingSources")
                    : areaBriefing?.sources?.length
                      ? copy(language, "monitoring")
                      : copy(language, "noSources")}
                </span>
                <span className="hidden sm:inline">
                  Updated {fmtTime(snapshot.lastUpdated)}
                </span>
              </div>
            </section>
            <div className="mb-4">
              <CityAreaSearch language={language} onChoose={chooseArea} />
            </div>
            <AreaBriefing
              area={focusedArea}
              briefing={areaBriefing}
              loading={areaLoading}
              error={areaError}
              language={language}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
              >
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
                places={cityPlaces}
                placesLoading={placesLoading}
                focusedArea={focusedArea}
                onSelectPlace={chooseArea}
                language={language}
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
                places={cityPlaces}
                placesLoading={placesLoading}
                placesError={placesError}
                focusedArea={focusedArea}
                onSelectPlace={chooseArea}
                language={language}
              />
            )}
            {tab === "intelligence" && (
              <Intelligence
                snapshot={snapshot}
                correlation={activeCorrelation}
                insight={latestInsight}
                language={language}
              />
            )}
            {tab === "events" && (
              <Events
                snapshot={snapshot}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
                language={language}
              />
            )}
            {tab === "alerts" && (
              <Alerts snapshot={snapshot} refresh={fetchState} language={language} />
            )}
            {tab === "replay" && <Replay snapshot={snapshot} language={language} />}
              </motion.div>
            </AnimatePresence>
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
  places,
  placesLoading,
  focusedArea,
  onSelectPlace,
  language,
}) {
  if (!view) return null;
  const f = view.pulse.factors;
  const s = view.signals;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Reveal className="lg:col-span-3">
        <LiveIncidentStrip snapshot={snapshot} language={language} />
      </Reveal>
      {/* Hero pulse */}
      <Reveal className="lg:col-span-1" delay={0.04}>
      <div className="cp-panel rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {copy(language, "civicPulse")}
          </div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
          >
            <option value="city">{copy(language, "wholeCity")}</option>
            {snapshot.zones.map((v) => (
              <option key={v.zone.id} value={v.zone.id}>
                {v.zone.label} · {v.zone.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="flex w-full min-w-0 flex-col items-center sm:w-auto sm:min-w-[180px]">
            <PulseRing score={view.pulse.score} />
          </div>

          <div className="w-full flex-1 space-y-3">
            <FactorBar label={copy(language, "weather")} value={f.weather} />
            <FactorBar label={copy(language, "traffic")} value={f.traffic} />
            <FactorBar label={copy(language, "transit")} value={f.transit} />
            <FactorBar label={copy(language, "incidents")} value={f.incidents} />
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {copy(language, "scenarioPulseNote")}
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
                    {isResolved ? `● ${copy(language, "incidentResolved")}` : `● ${copy(language, "incidentDetected")}`}
                  </div>

                  <div className="mt-1.5 text-sm font-semibold text-slate-100">
                    {event.title}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {zone?.zone?.label || copy(language, "unknownZone")}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
      </Reveal>

      {/* Signals */}
      <Reveal className="lg:col-span-2" delay={0.08}>
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          {copy(language, "activeSignals")}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignalCard
            source="weather"
            icon={CloudRain}
            name={copy(language, "weather")}
            severity={s.weather.severity}
            status={
              !s.weather.event
                ? language === "hi"
                  ? "इस डेटासेट में मौसम रिपोर्ट नहीं"
                  : copy(language, "noWeatherReport")
                : s.weather.event?.metadata?.temperature != null
                ? `${s.weather.event?.title || s.weather.title} · ${s.weather.event.metadata.temperature}°C`
                : s.weather.rainfall >= 4
                  ? `${copy(language, "heavyRain")} · ${s.weather.rainfall} mm/h`
                  : `${copy(language, "clearRain")} · ${s.weather.rainfall} mm/h`
            }
            sub={s.weather.event ? `${copy(language, "humidity")} ${
              s.weather.event?.metadata?.humidity != null
                ? `${s.weather.event.metadata.humidity}%`
                : "—"
            } · ${copy(language, "rainfall")} ${s.weather.rainfall} mm/h` : undefined}
          />
          <SignalCard
            source="traffic"
            icon={Car}
            name={copy(language, "traffic")}
            severity={s.traffic.severity}
            status={s.traffic.count ? `${s.traffic.count} ${copy(language, "recordedIncidents")}` : copy(language, "noTrafficReports")}
            change={s.traffic.count ? Math.round(s.traffic.pct) : null}
          />
          <SignalCard
            source="transit"
            icon={Bus}
            name={copy(language, "transit")}
            severity={s.transit.severity}
            status={s.transit.count ? `${s.transit.count} ${copy(language, "recordedRouteDelays")}` : copy(language, "noTransitReports")}
            change={s.transit.count ? Math.round(s.transit.pct) : null}
            sub={s.transit.count ? `${copy(language, "averageDelay")} ${s.transit.avgDelay || 0} min` : undefined}
          />
          <SignalCard
            source="incidents"
            icon={AlertTriangle}
            name={copy(language, "incidents")}
            severity={s.incidents.severity}
            status={s.incidents.count ? `${s.incidents.count} ${copy(language, "highSeverityReports")}` : copy(language, "noHighSeverityReports")}
          />
        </div>

        {/* Intelligence card */}
        <div className="mt-4">
          {correlation ? (
            <div className="cp-panel relative overflow-hidden rounded-2xl border border-sky-500/40 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-5">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div>
                  <div className="flex items-center gap-2 text-sky-300">
                    <Zap className="h-5 w-5" />
                    <span className="text-sm font-bold uppercase tracking-wide">
                      {copy(language, "detectedCorrelation")}
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
                <div className="self-end text-right sm:self-start">
                  <div className="text-3xl font-extrabold text-sky-300 sm:text-4xl">
                    {correlation.confidence}%
                  </div>
                  <div className="text-[11px] uppercase tracking-widest text-slate-400">
                    {copy(language, "confidence")}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-medium text-amber-300/90">
                  ⚠ {copy(language, "correlationDisclaimer")}
                </span>
                <button
                  onClick={goIntel}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  {copy(language, "explorePattern")} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : view.pulse.score == null ? (
            <div className="cp-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <CircleDot className="h-4 w-4 text-slate-400" />
                {copy(language, "noSignalData")}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {copy(language, "noSignalDetail")}
              </p>
            </div>
          ) : (
            <div className="cp-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                <span className="font-semibold">{copy(language, "nominalSignals")}</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {copy(language, "noCorrelationDescription")}
              </p>
            </div>
          )}
        </div>

        <MedicalResponse
          snapshot={snapshot}
          places={places}
          focusedArea={focusedArea}
          language={language}
        />

        {insight && (
          <div className="cp-panel mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
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
      </Reveal>

      <Reveal className="lg:col-span-3" delay={0.12}>
        <LandmarkGrid places={places} loading={placesLoading} onSelectPlace={onSelectPlace} language={language} />
      </Reveal>
    </div>
  );
}

/* ----------------------------- Map ----------------------------- */
function CityAtlas({ places, loading, error, onSelectPlace, language }) {
  const [category, setCategory] = useState("all");
  const filters = ["all", "areas", "hospitals", "landmarks"];
  const categoryForFilter = {
    area: "areas",
    hospital: "hospitals",
    landmark: "landmarks",
  };
  const filtered =
    category === "all"
      ? places
      : places.filter((place) => categoryForFilter[place.category] === category);
  const Icon = (place) =>
    place.category === "hospital"
      ? Building2
      : place.category === "area"
        ? MapPinned
        : LocateFixed;
  return (
    <section className="cp-panel mb-4 rounded-2xl border border-slate-800 bg-slate-900/65 p-4 sm:p-5 lg:col-span-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="cp-eyebrow">{copy(language, "placeAtlas")}</p>
          <p className="mt-1 text-sm text-slate-400">{copy(language, "placeAtlasDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy(language, "placeAtlas")}>
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setCategory(filter)}
              aria-pressed={category === filter}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                category === filter
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                  : "border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {filter === "all" ? copy(language, "allPlaces") : copy(language, filter)}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">{error}</p>
      ) : loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="h-4 w-4 animate-spin text-sky-300" />
          {copy(language, "loadingPlaces")}
        </div>
      ) : filtered.length ? (
        <div className="mt-4 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {filtered.slice(0, 18).map((place) => {
            const PlaceIcon = Icon(place);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => onSelectPlace(place)}
                className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2.5 text-left transition hover:border-sky-500/30 hover:bg-slate-800/70"
              >
                <PlaceIcon className={`mt-0.5 h-4 w-4 shrink-0 ${place.category === "hospital" ? "text-rose-300" : place.category === "area" ? "text-sky-300" : "text-amber-300"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-200">{place.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{copy(language, categoryForFilter[place.category] || "landmarks")}</span>
                </span>
                <MapPin className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">{copy(language, "noPlaces")}</p>
      )}
      <p className="mt-3 text-[11px] text-slate-500">{copy(language, "sourceNote")}</p>
    </section>
  );
}

function MapTab({
  snapshot,
  layers,
  setLayers,
  selectedEvent,
  setSelectedEvent,
  places,
  placesLoading,
  placesError,
  focusedArea,
  onSelectPlace,
  language,
}) {
  const toggle = (k) => setLayers((p) => ({ ...p, [k]: !p[k] }));
  const LAYERS = [
    { k: "weather", label: "layerWeather", c: "text-sky-300" },
    { k: "traffic", label: "layerTraffic", c: "text-amber-300" },
    { k: "transit", label: "layerTransit", c: "text-violet-300" },
    { k: "anomalies", label: "layerAnomalies", c: "text-rose-300" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <CityAtlas
        places={places}
        loading={placesLoading}
        error={placesError}
        onSelectPlace={onSelectPlace}
        language={language}
      />
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
              {copy(language, l.label)}
            </button>
          ))}
        </div>
        <div className="cp-panel h-[min(560px,70vh)] min-h-[360px] overflow-hidden rounded-xl border border-slate-800">
          <CivicMap
            snapshot={snapshot}
            layers={layers}
            selectedZoneId={null}
            onSelectEvent={setSelectedEvent}
            places={places}
            focusedPlace={focusedArea}
            onSelectPlace={onSelectPlace}
          />
        </div>
      </div>
      <div className="lg:col-span-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {copy(language, "eventDetails")}
        </div>
        {selectedEvent ? (
          <EventPanel event={selectedEvent} snapshot={snapshot} language={language} />
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
            {copy(language, "selectMapMarker")}
          </div>
        )}
      </div>
    </div>
  );
}

function EventPanel({ event, snapshot, language }) {
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
          k={language === "hi" ? "प्रकार" : "Type"}
          v={`${M?.name || event.source} · ${event.event_type || "—"}`}
        />
        <Row
          k={language === "hi" ? "गंभीरता" : "Severity"}
          v={<span className={`font-semibold ${s.text}`}>{s.label}</span>}
        />
        <Row k={language === "hi" ? "क्षेत्र" : "Zone"} v={zone?.zone.label + " · " + zone?.zone.name} />
        <Row k={language === "hi" ? "समय" : "Time"} v={fmtTime(event.timestamp)} />
        {event.value != null && (
          <Row k={language === "hi" ? "मान" : "Value"} v={`${event.value} ${event.unit || ""}`} />
        )}
        {event.metadata?.road && <Row k={language === "hi" ? "सड़क" : "Road"} v={event.metadata.road} />}
        {event.metadata?.route && <Row k={language === "hi" ? "मार्ग" : "Route"} v={event.metadata.route} />}
      </div>
      {event.description && (
        <p className="mt-3 text-sm text-slate-400">{event.description}</p>
      )}
      {corr && (
        <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <div className="text-xs font-semibold text-sky-300">
            {language === "hi" ? "संभावित संबंध" : "Possible relationship"}
          </div>
          <p className="mt-1 text-xs text-slate-300">{corr.explanation}</p>
          <div className="mt-2 text-xs text-slate-400">
            {copy(language, "confidence")} <b className="text-sky-300">{corr.confidence}%</b>
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
function Intelligence({ snapshot, correlation, insight, language }) {
  if (!correlation) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
        <Network className="mx-auto h-10 w-10 text-slate-600" />
        <div className="mt-3 font-semibold text-slate-200">
          {copy(language, "noActiveCorrelations")}
        </div>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          The correlation engine surfaces links when multiple civic signals
          {copy(language, "noCorrelationDescription")}
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
          {copy(language, "correlationPattern")} — {correlation.zoneLabel}
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
              {copy(language, "confidence")}
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
            <FactorLine label={copy(language, "locationOverlap")} v={factors.location} />
            <FactorLine label={copy(language, "timeOverlap")} v={factors.time} />
            <FactorLine label={copy(language, "anomalyStrength")} v={factors.anomaly} />
            <FactorLine label={copy(language, "signalStrength")} v={factors.signal} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="text-sm font-semibold text-slate-200">{copy(language, "evidence")}</div>
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
              <div className="text-slate-500">{copy(language, "sharedArea")}</div>
              <div className="font-semibold text-slate-200">
                {correlation.zoneLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{copy(language, "sharedTime")}</div>
              <div className="font-semibold text-slate-200">
                {fmtTime(win?.start)} – {fmtTime(win?.end)}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            ⚠ {copy(language, "correlationDisclaimer")}
          </div>
        </div>

        {insight && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
            <div className="mb-1 flex items-center gap-2 text-violet-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {copy(language, "groundedExplanation")}
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
function Events({ snapshot, selectedEvent, setSelectedEvent, language }) {
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
          {copy(language, "chronologicalTimeline")}
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
              {language === "hi" ? "अभी कोई घटना नहीं है। डेमो रीसेट करें या चलाएँ।" : "No events yet. Reset or play the scenario."}
            </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {copy(language, "eventDetails")}
        </div>
        {selectedEvent ? (
          <EventPanel event={selectedEvent} snapshot={snapshot} language={language} />
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
            {copy(language, "selectEventDetails")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Alerts ----------------------------- */
function Alerts({ snapshot, refresh, language }) {
  async function resolve(id) {
    await fetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    refresh();
  }
  const alerts = snapshot.alerts || [];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        {copy(language, "alertCenter")}
      </div>
      {alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
          <Bell className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          {copy(language, "noAlerts")}
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
                    {copy(language, "markResolved")}
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
function Replay({ snapshot, language }) {
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
          {copy(language, "historicalReplay")}
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          {copy(language, "demoReplay")}
        </span>
        <button
          onClick={play}
          disabled={playing || !events.length}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> {playing ? copy(language, "replaying") : copy(language, "play")}
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
        {copy(language, "replayDescription")}
      </p>
    </div>
  );
}

export default App;
