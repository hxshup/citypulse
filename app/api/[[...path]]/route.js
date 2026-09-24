import { NextResponse } from 'next/server'
import { ZONE3_ID } from '@/lib/civic/config'
import { seedNormalEvents, scenarioStepEvents } from '@/lib/civic/synthetic'
import { generateGroundedSummary } from '@/lib/civic/ai'
import {
  ensureZones, clearScenarioData, insertEvents, getSimState, setSimState,
  buildSnapshot, persistFindings, createInsightAndAlert, resolveAlert, getZones,
} from '@/lib/civic/store'
import { supabaseServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(data, status = 200) {
  const res = NextResponse.json(data, { status })
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export async function OPTIONS() { return json({}, 200) }

async function readTable(table, limit = 100) {
  const sb = supabaseServer()
  const orderCol = table === 'civic_events' ? 'timestamp'
    : (table === 'anomalies' || table === 'correlations') ? 'detected_at'
    : 'created_at'
  const { data, error } = await sb.from(table).select('*').order(orderCol, { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

// ---- Scenario driver ------------------------------------------------------
async function scenarioReset() {
  await ensureZones()
  await clearScenarioData()
  const base = new Date().toISOString()
  await insertEvents(seedNormalEvents(base))
  await setSimState(0, base)
  return { step: 0, message: 'City reset to normal state' }
}

async function scenarioAdvance() {
  const sim = await getSimState()
  const base = sim.base_ts || new Date().toISOString()
  const next = Math.min((sim.step || 0) + 1, 5)
  if (sim.step >= 5) return { step: 5, message: 'Scenario complete', done: true }

  if (next <= 3) {
    await insertEvents(scenarioStepEvents(next, base))
    await setSimState(next, base)
    const labels = {
      1: 'Heavy rainfall began in Zone 3',
      2: 'Traffic incidents spiking in Zone 3',
      3: 'Transit delays rising in Zone 3',
    }
    return { step: next, message: labels[next] }
  }

  // Steps 4 & 5 work on the deterministic snapshot for Zone 3
  const snap = await buildSnapshot()
  const z3 = snap.zones.find((v) => v.zone.id === ZONE3_ID)

  if (next === 4) {
    if (z3?.anomalies?.length) await persistFindings(z3.zone, z3.anomalies, z3.correlation)
    await setSimState(4, base)
    return { step: 4, message: 'Anomalies + correlation detected in Zone 3', correlation: z3?.correlation || null }
  }

  // next === 5: grounded AI insight + alert
  if (z3?.correlation) {
    const c = z3.correlation
    const finding = {
      zoneName: z3.zone.label,
      rainfall: z3.signals.weather.rainfall,
      trafficPct: Math.round(z3.signals.traffic.pct),
      transitPct: z3.signals.transit.pct >= 40 ? Math.round(z3.signals.transit.pct) : null,
      timeOverlapMin: c.time_overlap,
      confidence: c.confidence,
    }
    const { summary, ai } = await generateGroundedSummary(finding)
    await createInsightAndAlert(z3.zone, c, summary, ai)
    await setSimState(5, base)
    return { step: 5, message: 'CityPulse generated an insight', summary, ai, done: true }
  }
  await setSimState(5, base)
  return { step: 5, message: 'Scenario complete (no correlation)', done: true }
}

// ---- Router ---------------------------------------------------------------
async function handle(request, { params }) {
  const { path = [] } = await params
  const route = `/${(path || []).join('/')}`
  const method = request.method

  try {
    if (route === '/' || route === '/root') return json({ app: 'CityPulse', status: 'ok' })

    if (route === '/state' && method === 'GET') {
      await ensureZones()
      return json(await buildSnapshot())
    }
    if (route === '/zones' && method === 'GET') return json(await getZones())

    if (route === '/events' && method === 'GET') return json(await readTable('civic_events', 400))
    if (path[0] === 'events' && path[1] && method === 'GET') {
      const events = await readTable('civic_events', 400)
      const found = events.find((e) => e.id === path[1])
      if (!found) return json({ error: 'Event not found' }, 404)
      return json(found)
    }
    if (route === '/anomalies' && method === 'GET') return json(await readTable('anomalies'))
    if (route === '/correlations' && method === 'GET') return json(await readTable('correlations'))
    if (route === '/insights' && method === 'GET') return json(await readTable('insights'))
    if (route === '/alerts' && method === 'GET') return json(await readTable('alerts'))

    if (route === '/scenario/reset' && method === 'POST') return json(await scenarioReset())
    if (route === '/scenario/advance' && method === 'POST') return json(await scenarioAdvance())

    if (path[0] === 'alerts' && path[2] === 'resolve' && method === 'POST') {
      await resolveAlert(path[1])
      return json({ ok: true })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
