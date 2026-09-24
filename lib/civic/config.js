// ============================================================
// CityPulse configuration — baselines, thresholds, weights, zones
// All intelligence tuning lives here so it stays transparent.
// ============================================================

export const CITY = { name: 'San Francisco', center: [37.7793, -122.4193], zoom: 13 }

// Stable UUIDs so civic_events can reference zones deterministically.
export const ZONES = [
  { id: '11111111-1111-1111-1111-111111111111', label: 'Zone 1', name: 'Financial District', city: 'San Francisco', latitude: 37.7946, longitude: -122.3999, radius: 850 },
  { id: '22222222-2222-2222-2222-222222222222', label: 'Zone 2', name: 'Mission District', city: 'San Francisco', latitude: 37.7599, longitude: -122.4148, radius: 1000 },
  { id: '33333333-3333-3333-3333-333333333333', label: 'Zone 3', name: 'Civic Center', city: 'San Francisco', latitude: 37.7793, longitude: -122.4193, radius: 850 },
  { id: '44444444-4444-4444-4444-444444444444', label: 'Zone 4', name: 'Marina', city: 'San Francisco', latitude: 37.8037, longitude: -122.4368, radius: 950 },
]

export const ZONE3_ID = '33333333-3333-3333-3333-333333333333'

// Normal (baseline) reference values used by anomaly detection.
export const BASELINE = {
  traffic: 2,    // normal count of active traffic incidents per zone
  transit: 2,    // normal count of active transit delay events per zone
  rainfall: 0.6, // mm/h normal reference
}

export const THRESHOLD = {
  anomalyPct: 40,          // % change above baseline => anomaly
  highPct: 100,            // % change => HIGH anomaly
  rainfallModerate: 4,     // mm/h => moderate rain anomaly
  rainfallHeavy: 10,       // mm/h => heavy rain anomaly
  correlationConfidence: 55, // % confidence needed to surface a correlation
  correlationWindowMin: 45,  // minutes: correlation time window
  staleFeedMin: 30,        // a feed older than this is flagged stale
}

// Correlation confidence = weighted sum of 4 transparent factors (sum = 1.0)
export const CONFIDENCE_WEIGHTS = { location: 0.30, time: 0.25, anomaly: 0.25, signal: 0.20 }

// Civic Pulse = weighted average of 4 sub-scores (sum = 1.0)
export const PULSE_WEIGHTS = { weather: 0.25, traffic: 0.30, transit: 0.25, incidents: 0.20 }
