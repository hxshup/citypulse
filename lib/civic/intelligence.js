// ============================================================
// CityPulse Intelligence Engine (deterministic).
// Operates ONLY on normalized CivicEvents.
//   1. Signal aggregation per zone
//   2. Anomaly detection (baseline vs current)
//   3. Correlation detection + transparent confidence
//   4. Civic Pulse scoring
// ============================================================
import { BASELINE, THRESHOLD, CONFIDENCE_WEIGHTS, PULSE_WEIGHTS } from './config'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pct = (cur, base) => (base > 0 ? ((cur - base) / base) * 100 : 0)
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const SEV_RANK = { low: 1, medium: 2, high: 3 }

function active(events) { return events.filter((e) => e.status !== 'resolved') }
function bySource(events, s) { return active(events).filter((e) => e.source === s) }
function latest(events) {
  return events.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
}
function maxSeverity(events) {
  let best = 'low'
  for (const e of events) if ((SEV_RANK[e.severity] || 0) > (SEV_RANK[best] || 0)) best = e.severity
  return best
}

// ---- 1. Signals -----------------------------------------------------------
export function computeZoneSignals(zone, events) {
  const weatherEvents = bySource(events, 'weather')
  const weather = latest(weatherEvents)
  const rainfall = weather ? Number(weather.value) || 0 : 0
  const traffic = bySource(events, 'traffic')
  const transit = bySource(events, 'transit')
  const trafficPct = pct(traffic.length, BASELINE.traffic)
  const transitPct = pct(transit.length, BASELINE.transit)
  const highSeverity = active(events).filter((e) => e.severity === 'high').length
  const delays = transit.map((e) => Number(e?.metadata?.delay) || Number(e.value) || 0)
  return {
    weather: {
      rainfall, unit: weather?.unit || 'mm/h', title: weather?.title || 'No data',
      severity: weather?.severity || 'low', status: weather ? 'ok' : 'missing', event: weather || null,
    },
    traffic: { count: traffic.length, pct: trafficPct, severity: maxSeverity(traffic), events: traffic },
    transit: { count: transit.length, pct: transitPct, severity: maxSeverity(transit), avgDelay: Math.round(avg(delays)), events: transit },
    incidents: { count: highSeverity, severity: highSeverity >= 3 ? 'high' : highSeverity >= 1 ? 'medium' : 'low' },
  }
}

// ---- 2. Anomalies ---------------------------------------------------------
export function detectAnomalies(zone, signals) {
  const out = []
  if (signals.weather.rainfall >= THRESHOLD.rainfallModerate) {
    out.push({
      zone_id: zone.id, event_type: 'weather', metric: 'rainfall_mm_h',
      baseline_value: BASELINE.rainfall, current_value: signals.weather.rainfall,
      change_percent: Math.round(pct(signals.weather.rainfall, BASELINE.rainfall)),
      severity: signals.weather.rainfall >= THRESHOLD.rainfallHeavy ? 'high' : 'medium',
      label: `Heavy rainfall (${signals.weather.rainfall} mm/h)`,
    })
  }
  if (signals.traffic.pct >= THRESHOLD.anomalyPct) {
    out.push({
      zone_id: zone.id, event_type: 'traffic', metric: 'traffic_incidents',
      baseline_value: BASELINE.traffic, current_value: signals.traffic.count,
      change_percent: Math.round(signals.traffic.pct),
      severity: signals.traffic.pct >= THRESHOLD.highPct ? 'high' : 'medium',
      label: `Traffic incidents +${Math.round(signals.traffic.pct)}%`,
    })
  }
  if (signals.transit.pct >= THRESHOLD.anomalyPct) {
    out.push({
      zone_id: zone.id, event_type: 'transit', metric: 'transit_delays',
      baseline_value: BASELINE.transit, current_value: signals.transit.count,
      change_percent: Math.round(signals.transit.pct),
      severity: signals.transit.pct >= THRESHOLD.highPct ? 'high' : 'medium',
      label: `Transit delays +${Math.round(signals.transit.pct)}%`,
    })
  }
  return out
}

// ---- 3. Correlation + confidence -----------------------------------------
export function detectCorrelation(zone, anomalies, events, signals) {
  const hasWeather = anomalies.find((a) => a.event_type === 'weather')
  const hasTraffic = anomalies.find((a) => a.metric === 'traffic_incidents')
  const hasTransit = anomalies.find((a) => a.metric === 'transit_delays')
  if (!hasWeather || (!hasTraffic && !hasTransit)) return null

  const involved = [hasWeather, hasTraffic, hasTransit].filter(Boolean)
  const zoneEvents = active(events).filter((e) => ['weather', 'traffic', 'transit'].includes(e.source))
  const times = zoneEvents.map((e) => new Date(e.timestamp).getTime())
  const start = Math.min(...times), end = Math.max(...times)
  const spreadMin = (end - start) / 60000
  const timeScore = clamp(1 - spreadMin / THRESHOLD.correlationWindowMin, 0, 1)
  const anomStrength = avg(involved.map((a) =>
    a.event_type === 'weather'
      ? clamp(signals.weather.rainfall / THRESHOLD.rainfallHeavy, 0, 1)
      : clamp(Math.abs(a.change_percent) / 200, 0, 1)))
  const signalStrength = involved.length / 3
  const locationOverlap = 1
  const w = CONFIDENCE_WEIGHTS
  const confidence = Math.round(100 * (
    w.location * locationOverlap + w.time * timeScore + w.anomaly * anomStrength + w.signal * signalStrength))

  if (confidence < THRESHOLD.correlationConfidence) return null

  const evidence = involved.map((a) =>
    a.event_type === 'weather'
      ? { label: 'Rainfall', value: `${signals.weather.rainfall} mm/h (heavy)`, severity: a.severity }
      : a.metric === 'traffic_incidents'
        ? { label: 'Traffic incidents', value: `+${a.change_percent}%`, severity: a.severity }
        : { label: 'Transit delays', value: `+${a.change_percent}%`, severity: a.severity })

  const weatherEvent = signals.weather.event
  const trafficEvent = latest(signals.traffic.events || [])

  return {
    zone_id: zone.id,
    correlation_type: 'weather_traffic_transit',
    confidence,
    time_overlap: Math.round(spreadMin),
    location_overlap: locationOverlap,
    window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    factors: {
      location: locationOverlap,
      time: Number(timeScore.toFixed(2)),
      anomaly: Number(anomStrength.toFixed(2)),
      signal: Number(signalStrength.toFixed(2)),
    },
    evidence,
    involved: involved.map((a) => a.metric),
    event_a_id: weatherEvent?.id || null,
    event_b_id: trafficEvent?.id || null,
    explanation:
      `Heavy rainfall coincides with elevated ${hasTraffic ? 'traffic incidents' : ''}` +
      `${hasTraffic && hasTransit ? ' and ' : ''}${hasTransit ? 'transit delays' : ''} in ${zone.label} ` +
      `within a ${Math.round(spreadMin)}-minute window (possible correlation, not confirmed causation).`,
  }
}

// ---- 4. Civic Pulse score -------------------------------------------------
// Each sub-score is 0-100 where 100 = healthy. Penalties grow with signal stress.
export function computePulse(signals) {
const weatherSub = clamp(100 - Math.max(0, signals.weather.rainfall - 2) * 6, 0, 100)
const trafficSub = clamp(100 - Math.max(0, signals.traffic.pct) * 0.35, 0, 100)
const transitSub = clamp(100 - Math.max(0, signals.transit.pct) * 0.35, 0, 100)
const incidentsSub = clamp(100 - signals.incidents.count * 18, 0, 100)
  const w = PULSE_WEIGHTS
  const score = Math.round(
    weatherSub * w.weather + trafficSub * w.traffic + transitSub * w.transit + incidentsSub * w.incidents)
  return {
    score,
    factors: {
      weather: Math.round(weatherSub),
      traffic: Math.round(trafficSub),
      transit: Math.round(transitSub),
      incidents: Math.round(incidentsSub),
    },
  }
}
