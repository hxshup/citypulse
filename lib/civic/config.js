// ============================================================
// CityPulse configuration — baselines, thresholds, weights, zones
// All intelligence tuning lives here so it stays transparent.
// ============================================================

// Stable UUIDs so civic_events can reference zones deterministically.
export const CITY = {
  name: 'Jaipur',
  center: [26.9124, 75.7873],
  zoom: 13,
}

// Stable UUIDs so civic_events can reference zones deterministically.

export const ZONES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'Zone 1',
    name: 'Pink City',
    city: 'Jaipur',
    latitude: 26.9239,
    longitude: 75.8267,
    radius: 850,
  },

  {
    id: '22222222-2222-2222-2222-222222222222',
    label: 'Zone 2',
    name: 'C-Scheme',
    city: 'Jaipur',
    latitude: 26.9124,
    longitude: 75.7873,
    radius: 1000,
  },

  {
   id: '33333333-3333-3333-3333-333333333333',
   label: 'Zone 3',
   name: 'Civic Center',
   city: 'Jaipur',
   latitude: 26.9188,
   longitude: 75.8004,
   radius: 700,
 },

  {
    id: '44444444-4444-4444-4444-444444444444',
    label: 'Zone 4',
    name: 'Malviya Nagar',
    city: 'Jaipur',
    latitude: 26.8543,
    longitude: 75.8078,
    radius: 950,
  },
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


// Jaipur landmark context points.
// Landmarks use their own real-world coordinates.
// zoneId links each landmark to the civic zone containing it.

export const LANDMARKS = [
  {
    id: 'hawa-mahal',
    name: 'Hawa Mahal',
    type: 'Landmark',
    zoneId: '11111111-1111-1111-1111-111111111111',
    latitude: 26.9239,
    longitude: 75.8267,
    description: 'Iconic landmark at Badi Chaupar in the Pink City.',
  },
  {
    id: 'city-palace',
    name: 'City Palace',
    type: 'Landmark',
    zoneId: '11111111-1111-1111-1111-111111111111',
    latitude: 26.9258,
    longitude: 75.8237,
    description: 'Historic palace complex in the heart of the Pink City.',
  },
  {
    id: 'jantar-mantar',
    name: 'Jantar Mantar',
    type: 'Landmark',
    zoneId: '11111111-1111-1111-1111-111111111111',
    latitude: 26.9247,
    longitude: 75.8246,
    description: 'Historic astronomical observatory near City Palace.',
  },
  {
    id: 'albert-hall',
    name: 'Albert Hall Museum',
    type: 'Landmark',
    zoneId: '22222222-2222-2222-2222-222222222222',
    latitude: 26.9115,
    longitude: 75.8190,
    description: 'Major museum beside Ram Niwas Garden.',
  },
]