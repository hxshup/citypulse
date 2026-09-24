# CityPulse — Live Civic Intelligence & Neighborhood Health

> **See what's happening. Understand why it matters.**

CityPulse fuses multiple civic data streams into one glanceable, real-time view of a
neighborhood. It detects anomalies, finds **possible correlations** between civic signals,
scores neighborhood health, and generates **grounded** plain-language explanations —
clearly distinguishing correlation from causation.

---

## Core value pipeline

```
MULTIPLE CIVIC SIGNALS → DATA FUSION → ANOMALY DETECTION → CORRELATION
→ EVIDENCE → PLAIN-LANGUAGE EXPLANATION → ACTIONABLE CIVIC AWARENESS
```

## Tech stack

| Layer            | Technology                                             |
|------------------|--------------------------------------------------------|
| Frontend         | Next.js (App Router), React, Tailwind, shadcn/ui       |
| Map              | Leaflet + OpenStreetMap (free, no API key)             |
| Database         | Supabase PostgreSQL (RLS + Realtime-ready)             |
| AI explanation   | OpenAI (via Emergent universal key) + deterministic fallback |
| Live updates     | Polling (modular — swappable for Supabase Realtime)    |

## Architecture (separation of concerns)

```
lib/civic/config.js       Baselines, thresholds, confidence + pulse weights, zones
lib/civic/synthetic.js    Data adapters → normalized CivicEvents (swap for real APIs)
lib/civic/intelligence.js Deterministic engine: signals, anomalies, correlation, pulse
lib/civic/ai.js           Grounded AI summary (uses ONLY verified findings) + fallback
lib/civic/store.js        Supabase reads/writes + live snapshot builder
lib/supabase/server.js    Server-only Supabase client (secret key, never in browser)
app/api/[[...path]]/route.js  REST API (state, scenario, list endpoints)
app/page.js               UI shell + 6 screens (polling live updates)
components/civic/CivicMap.jsx  Leaflet map
```

The **intelligence engine operates only on normalized `CivicEvent`s**, so synthetic
adapters can be replaced by real public APIs without touching the engine or frontend.

## Data model — `CivicEvent`
`id, source, event_type, title, description, zone_id, latitude, longitude, severity,
value, unit, status, timestamp, metadata, created_at`

Tables: `zones, civic_events, anomalies, correlations, insights, alerts` (+ `sim_state`
for the demo cursor). See `supabase_migration.sql`.

## Algorithms (transparent & documented)

**Anomaly detection** — current vs baseline:
`change% = (current − baseline) / baseline × 100`; anomaly if `change% ≥ 40`, HIGH if `≥ 100`.
Rainfall uses intensity thresholds (moderate ≥ 4 mm/h, heavy ≥ 10 mm/h).

**Correlation confidence** (0–100), a weighted sum of 4 explainable factors:
```
confidence = 100 × ( 0.30·location_overlap
                   + 0.25·time_overlap_score
                   + 0.25·anomaly_strength
                   + 0.20·signal_strength )
```
Surfaced only when ≥ 55% AND a weather anomaly co-occurs with a traffic/transit anomaly
in the same zone within a 45-minute window. **Always labelled a possible correlation,
never confirmed causation.**

**Civic Pulse** (0–100 per zone, higher = healthier):
```
pulse = 0.25·weather + 0.30·traffic + 0.25·transit + 0.20·incidents
```
Each sub-score penalizes signal stress (rainfall intensity, % change, high-severity count).

**AI layer** — receives *only* the deterministic verified findings and rephrases them in
hedged language ("possible correlation", "coincides with"). Falls back to a deterministic
template if the AI API is unavailable.

## API

| Method | Route                         | Purpose                                  |
|--------|-------------------------------|------------------------------------------|
| GET    | `/api/state`                  | Live snapshot (signals, anomalies, correlations, pulse, feeds, insights, alerts) |
| POST   | `/api/scenario/reset`         | Reset city to normal state               |
| POST   | `/api/scenario/advance`       | Advance scripted Zone-3 scenario 1 step  |
| GET    | `/api/zones` `/events` `/anomalies` `/correlations` `/insights` `/alerts` | Records |
| GET    | `/api/events/:id`             | Single event                             |
| POST   | `/api/alerts/:id/resolve`     | Resolve an alert                         |

## Screens
Overview • Live Map • Intelligence (correlation tree + evidence + confidence) •
Events (chronological timeline) • Alerts • Historical Replay.

## Demo (scripted Zone-3 scenario)
1. Open CityPulse → normal city state (all pulses ~100).
2. Click **Play Zone-3 Scenario** (or **Next** to step manually).
3. Heavy rainfall begins in Zone 3 → traffic incidents spike → transit delays rise.
4. Engine detects 3 HIGH anomalies → correlation (~86% confidence) → grounded AI insight → alert.
5. Explore the Intelligence tree, Event timeline, and Replay.

## Setup
1. Create a free Supabase project; run `supabase_migration.sql` in the SQL Editor.
2. Set env in `.env`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `EMERGENT_LLM_KEY`, `EMERGENT_OPENAI_MODEL`.
3. `yarn install` and run via supervisor (Next.js on port 3000).

## Security
Secret keys are server-only (never `NEXT_PUBLIC_`). RLS enabled; public read for civic data;
all writes via server secret key. Only synthetic/public civic data — no personal data.
