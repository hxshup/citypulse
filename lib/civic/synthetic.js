// ============================================================
// Synthetic civic data adapters.
// These produce NORMALIZED CivicEvent rows (civic_events shape).
// Swapping these for real public APIs would not change the
// intelligence layer or the frontend.
// ============================================================
import { randomUUID } from 'crypto'
import { ZONES, ZONE3_ID } from './config'

function jitter(base, amount) {
  return base + (Math.random() - 0.5) * amount
}

function minutes(base, m) {
  return new Date(new Date(base).getTime() + m * 60000).toISOString()
}

function ev(partial) {
  return {
    id: randomUUID(),
    source: 'weather',
    event_type: null,
    title: '',
    description: '',
    zone_id: null,
    latitude: null,
    longitude: null,
    severity: 'low',
    value: null,
    unit: null,
    status: 'active',
    timestamp: new Date().toISOString(),
    metadata: { demo: true },
    created_at: new Date().toISOString(),
    ...partial,
    metadata: { demo: true, ...(partial.metadata || {}) },
  }
}

const ROADS = ['MI Road', 'Tonk Road', 'Ajmer Road', 'JLN Marg', 'Amber Road', 'Sikar Road', 'Gopalpura Bypass']
const ROUTES = ['Jaipur Metro Pink Line', 'Mansarovar–Badi Chaupar', 'Civil Lines corridor']

// ---- NORMAL STATE (reset) -------------------------------------------------
export function seedNormalEvents(baseTs) {
  const rows = []
  for (const z of ZONES) {
    // Weather — clear / light
    rows.push(ev({
      source: 'weather', event_type: 'conditions', title: 'Clear conditions',
      description: 'Stable weather, light winds.', zone_id: z.id,
      latitude: jitter(z.latitude, 0.004), longitude: jitter(z.longitude, 0.004),
      severity: 'low', value: Number(jitter(0.4, 0.4).toFixed(1)), unit: 'mm/h',
      status: 'active', timestamp: minutes(baseTs, -2),
      metadata: { temperature: Math.round(jitter(18, 3)), humidity: Math.round(jitter(55, 10)) },
    }))
    // Traffic = realistic zone-to-zone variation
const trafficCount =
  z.label === 'Zone 1' ? 3 :
  z.label === 'Zone 2' ? 1 :
  z.label === 'Zone 3' ? 2 :
  3

for (let i = 0; i < trafficCount; i++) {
      rows.push(ev({
        source: 'traffic', event_type: 'incident', title: 'Minor traffic incident',
        description: `Slow traffic reported on ${ROADS[(i) % ROADS.length]}.`, zone_id: z.id,
        latitude: jitter(z.latitude, 0.006), longitude: jitter(z.longitude, 0.006),
        severity: 'low', value: 1, unit: 'incident', status: 'active', timestamp: minutes(baseTs, -i),
        metadata: { road: ROADS[i % ROADS.length] },
      }))
    }
    // Transit = realistic zone-to-zone variation
const transitCount =
  z.label === 'Zone 1' ? 1 :
  z.label === 'Zone 2' ? 3 :
  z.label === 'Zone 3' ? 2 :
  1

for (let i = 0; i < transitCount; i++) {
      rows.push(ev({
        source: 'transit', event_type: 'delay', title: 'Minor transit delay',
        description: `${ROUTES[i % ROUTES.length]} running slightly behind schedule.`, zone_id: z.id,
        latitude: jitter(z.latitude, 0.006), longitude: jitter(z.longitude, 0.006),
        severity: 'low', value: Math.round(jitter(4, 2)), unit: 'min', status: 'active', timestamp: minutes(baseTs, -i),
        metadata: { route: ROUTES[i % ROUTES.length], delay: Math.round(jitter(4, 2)) },
      }))
    }
  }
  return rows
}

// ---- SCENARIO STEPS (Zone 3 escalation) -----------------------------------
// step 1: heavy rainfall  |  step 2: traffic spike  |  step 3: transit spike
export function scenarioStepEvents(step, baseTs) {
  const z = ZONES.find((x) => x.id === ZONE3_ID)
  if (step === 1) {
    return [ev({
      source: 'weather', event_type: 'rainfall', title: 'Heavy rainfall',
      description: 'Intense rainfall developing over Civic Center. Weather alert issued.',
      zone_id: z.id, latitude: jitter(z.latitude, 0.003), longitude: jitter(z.longitude, 0.003),
      severity: 'high', value: 12, unit: 'mm/h', status: 'active', timestamp: minutes(baseTs, 6),
      metadata: { alert: 'Heavy Rain Warning', temperature: 14, humidity: 92 },
    })]
  }
  if (step === 2) {
    const titles = ['Multi-vehicle collision', 'Road flooding', 'Stalled vehicle', 'Signal outage', 'Debris on roadway']
    return titles.map((t, i) => ev({
      source: 'traffic', event_type: 'incident', title: t,
      description: `${t} reported on ${ROADS[i % ROADS.length]} amid poor visibility.`,
      zone_id: z.id, latitude: jitter(z.latitude, 0.006), longitude: jitter(z.longitude, 0.006),
      severity: i < 3 ? 'high' : 'medium', value: 1, unit: 'incident', status: 'active',
      timestamp: minutes(baseTs, 14 + i), metadata: { road: ROADS[i % ROADS.length] },
    }))
  }
  if (step === 3) {
    const rts = ['Route 14', 'Route 49', 'N-Judah', 'Route 22']
    return rts.map((r, i) => ev({
      source: 'transit', event_type: 'delay', title: 'Major transit delay',
      description: `${r} severely delayed due to congestion and flooding.`,
      zone_id: z.id, latitude: jitter(z.latitude, 0.006), longitude: jitter(z.longitude, 0.006),
      severity: i < 2 ? 'high' : 'medium', value: Math.round(jitter(22, 8)), unit: 'min', status: 'active',
      timestamp: minutes(baseTs, 21 + i), metadata: { route: r, delay: Math.round(jitter(22, 8)) },
    }))
  }
  return []
}
