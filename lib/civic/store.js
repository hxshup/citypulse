// ============================================================
// Data access + snapshot builder.
// Reads normalized events from Supabase and runs the
// intelligence engine to produce a single live snapshot.
// ============================================================
import { randomUUID } from 'crypto'
import { supabaseServer } from '@/lib/supabase/server'
import { ZONES, THRESHOLD } from './config'
import { computeZoneSignals, detectAnomalies, detectCorrelation, computePulse } from './intelligence'

const TABLES = ['civic_events', 'anomalies', 'correlations', 'insights', 'alerts']

export async function ensureZones() {
  const sb = supabaseServer()
  const { data, error } = await sb.from('zones').select('id')
  if (error) { console.error('[zones.select]', error.message); throw new Error('DB not ready: ' + error.message) }
  if (!data || data.length === 0) {
    const { error: insErr } = await sb.from('zones').insert(ZONES.map((z) => ({
      id: z.id, name: z.name, label: z.label, city: z.city,
      latitude: z.latitude, longitude: z.longitude, radius: z.radius,
    })))
    if (insErr) console.error('[zones.insert]', insErr.message)
  }
}

export async function getZones() {
  const sb = supabaseServer()
  const { data } = await sb.from('zones').select('*').order('label')
  return data || []
}

export async function clearScenarioData() {
  const sb = supabaseServer()
  for (const t of TABLES) {
    await sb.from(t).delete().not('id', 'is', null)
  }
}

export async function insertEvents(rows) {
  if (!rows || !rows.length) return
  const sb = supabaseServer()
  const { error } = await sb.from('civic_events').insert(rows)
  if (error) console.error('[civic_events.insert]', error.message)
}

export async function getSimState() {
  const sb = supabaseServer()
  const { data } = await sb.from('sim_state').select('*').eq('id', 'demo').maybeSingle()
  return data || { id: 'demo', step: 0, base_ts: null }
}

export async function setSimState(step, baseTs) {
  const sb = supabaseServer()
  const row = { id: 'demo', step, updated_at: new Date().toISOString() }
  if (baseTs) row.base_ts = baseTs
  await sb.from('sim_state').upsert(row)
}

// Persist deterministic findings (records for Intelligence/Alert history).
export async function persistFindings(zone, anomalies, correlation) {
  const sb = supabaseServer()
  if (anomalies?.length) {
    await sb.from('anomalies').insert(anomalies.map((a) => ({
      zone_id: zone.id, event_type: a.event_type, metric: a.metric,
      baseline_value: a.baseline_value, current_value: a.current_value,
      change_percent: a.change_percent, severity: a.severity,
      metadata: { label: a.label },
    })))
  }
  if (correlation) {
    await sb.from('correlations').insert({
      zone_id: zone.id, event_a_id: correlation.event_a_id, event_b_id: correlation.event_b_id,
      correlation_type: correlation.correlation_type, confidence: correlation.confidence,
      time_overlap: correlation.time_overlap, location_overlap: correlation.location_overlap,
      explanation: correlation.explanation,
      metadata: { evidence: correlation.evidence, factors: correlation.factors, window: correlation.window },
    })
  }
}

export async function createInsightAndAlert(zone, correlation, summary, ai) {
  const sb = supabaseServer()
  const insightId = randomUUID()
  await sb.from('insights').insert({
    id: insightId, zone_id: zone.id,
    title: `Possible weather-related disruption in ${zone.label}`,
    summary, severity: 'high', confidence: correlation.confidence,
    insight_type: 'correlation', source_event_ids: [correlation.event_a_id, correlation.event_b_id].filter(Boolean),
    metadata: { ai, evidence: correlation.evidence, window: correlation.window },
  })
  await sb.from('alerts').insert({
    zone_id: zone.id, insight_id: insightId, alert_type: 'correlation', severity: 'high',
    title: 'Possible traffic disruption', message:
      `Heavy rainfall coincides with a rise in traffic incidents and transit delays in ${zone.label}.`,
    status: 'active',
  })
  return insightId
}

export async function resolveAlert(id) {
  const sb = supabaseServer()
  await sb.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
}

function feedStatus(events, source) {
  const list = events.filter((e) => e.source === source)
  if (!list.length) return { source, status: 'missing', lastUpdated: null }
  const last = list.reduce((m, e) => (new Date(e.timestamp) > new Date(m.timestamp) ? e : m))
  const ageMin = (Date.now() - new Date(last.timestamp).getTime()) / 60000
  return { source, status: ageMin > THRESHOLD.staleFeedMin ? 'stale' : 'ok', lastUpdated: last.timestamp, count: list.length }
}

// The single source of truth for the UI.
export async function buildSnapshot() {
  const sb = supabaseServer()
  const [zonesRes, eventsRes, insightsRes, alertsRes, sim] = await Promise.all([
    sb.from('zones').select('*').order('label'),
    sb.from('civic_events').select('*').order('timestamp', { ascending: false }).limit(400),
    sb.from('insights').select('*').order('created_at', { ascending: false }).limit(50),
    sb.from('alerts').select('*').order('created_at', { ascending: false }).limit(50),
    getSimState(),
  ])
  const zones = zonesRes.data || []
  const events = (eventsRes.data || []).map((e) => ({ ...e, value: e.value == null ? null : Number(e.value) }))
  const activeEvents = events.filter((e) => e.status === 'active')

  const zoneViews = zones.map((z) => {
   const zEvents = activeEvents.filter((e) => e.zone_id === z.id)
    const signals = computeZoneSignals(z, zEvents)
    const anomalies = detectAnomalies(z, signals)
    const correlation = detectCorrelation(z, anomalies, zEvents, signals)
    const pulse = computePulse(signals)
    return { zone: z, signals, anomalies, correlation, pulse, eventCount: zEvents.length }
  })

  const scores = zoneViews.map((v) => v.pulse.score)
  const cityScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100
  const cityFactors = ['weather', 'traffic', 'transit', 'incidents'].reduce((acc, k) => {
    acc[k] = Math.round(zoneViews.reduce((s, v) => s + v.pulse.factors[k], 0) / (zoneViews.length || 1))
    return acc
  }, {})

  const correlations = zoneViews.filter((v) => v.correlation).map((v) => ({ ...v.correlation, zoneLabel: v.zone.label, zoneName: v.zone.name }))
  const anomalies = zoneViews.flatMap((v) => v.anomalies.map((a) => ({ ...a, zoneLabel: v.zone.label })))
  const feeds = ['weather', 'traffic', 'transit'].map((s) => feedStatus(events, s))

  return {
    city: { name: zones[0]?.city || 'Jaipur', pulse: cityScore, factors: cityFactors },
    zones: zoneViews,
    events,
    anomalies,
    correlations,
    insights: insightsRes.data || [],
    alerts: alertsRes.data || [],
    feeds,
    step: sim.step || 0,
    baseTs: sim.base_ts,
    lastUpdated: new Date().toISOString(),
  }
}
