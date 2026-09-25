# CityPulse — Live Civic Intelligence & Neighborhood Health

> See what's happening. Understand why it matters.

CityPulse fuses multiple civic data streams into one glanceable, real-time view of a neighborhood. It detects anomalies, finds possible correlations between civic signals, scores neighborhood health, and generates grounded plain-language explanations while clearly distinguishing correlation from causation.

---

## At a glance

```text
MULTIPLE CIVIC SIGNALS → DATA FUSION → ANOMALY DETECTION → CORRELATION
→ EVIDENCE → PLAIN-LANGUAGE EXPLANATION → ACTIONABLE CIVIC AWARENESS
```

### Why it matters

- Real-time visibility into neighborhood conditions
- Transparent civic signal analysis instead of opaque black-box output
- Explainable findings with explicit confidence and evidence
- Actionable awareness for residents, operators, and civic stakeholders

---

## Tech stack

| Layer          | Technology                                          |
| -------------- | --------------------------------------------------- |
| Frontend       | Next.js (App Router), React, Tailwind, shadcn/ui    |
| Map            | Leaflet + OpenStreetMap (free, no API key)          |
| Database       | Supabase PostgreSQL (RLS + Realtime-ready)          |
| AI explanation | OpenAI API + deterministic fallback                 |
| Live updates   | Polling (modular — swappable for Supabase Realtime) |

---

## Architecture and separation of concerns

```text
lib/civic/config.js            Baselines, thresholds, confidence + pulse weights, zones, landmarks
lib/civic/synthetic.js         Synthetic data adapters → normalized CivicEvents
                              (designed to be swappable for real APIs)
lib/civic/intelligence.js      Deterministic engine: signals, anomalies, correlation, confidence, pulse
lib/civic/ai.js                Grounded AI summary (uses ONLY verified findings) + deterministic fallback
lib/civic/store.js             Supabase reads/writes + live snapshot builder
lib/supabase/server.js         Server-only Supabase client (secret key, never in browser)
app/api/[[...path]]/route.js  REST API: state, live events, scenarios, records
app/page.js                   UI shell + 6 screens + polling live updates
components/civic/CivicMap.jsx Leaflet map + civic zones + landmarks + events
```

---

## Data model

### CivicEvent

| Field       | Description               |
| ----------- | ------------------------- |
| id          | Unique event ID           |
| source      | Data source               |
| event_type  | Event category            |
| title       | Human-readable title      |
| description | Event description         |
| zone_id     | Related civic zone        |
| latitude    | Geographic latitude       |
| longitude   | Geographic longitude      |
| severity    | Severity level            |
| value       | Measured signal value     |
| unit        | Unit of measurement       |
| status      | Event status              |
| timestamp   | Event timestamp           |
| metadata    | Extra structured metadata |
| created_at  | Creation timestamp        |

### Database tables

- zones
- civic_events
- anomalies
- correlations
- insights
- alerts
- sim_state

`sim_state` is used for the deterministic demo scenario cursor.

See `supabase_migration.sql` for the database schema and policies.

---

## Algorithms and intelligence model

### Anomaly detection

Anomaly detection compares the current signal against its configured baseline.

```text
change% = (current − baseline) / baseline × 100
```

Anomaly thresholds:

- ANOMALY: change% ≥ 40
- HIGH: change% ≥ 100

Rainfall additionally uses intensity thresholds:

- Moderate rainfall: ≥ 4 mm/h
- Heavy rainfall: ≥ 10 mm/h

These thresholds are configured in `lib/civic/config.js`.

### Correlation confidence

Correlation confidence is calculated using a weighted combination of four explainable factors:

```text
confidence = 100 × (
    0.30 · location_overlap
  + 0.25 · time_overlap_score
  + 0.25 · anomaly_strength
  + 0.20 · signal_strength
)
```

A correlation is surfaced only when all of the following are true:

- confidence ≥ 55%
- weather anomaly
- traffic or transit anomaly
- same civic zone
- within a 45-minute correlation window

The system always labels this as a possible correlation and never presents it as confirmed causation.

### Civic Pulse

Civic Pulse is calculated independently for each zone.

```text
pulse = 0.25 · weather
      + 0.30 · traffic
      + 0.25 · transit
      + 0.20 · incidents
```

The resulting score ranges from 0 to 100, where a higher score represents healthier current civic conditions.

Each sub-score penalizes signal stress such as:

- rainfall intensity
- traffic percentage change
- transit percentage change
- high-severity incident count

The pulse calculation is deterministic and transparent.

---

## AI layer

The AI explanation layer receives only verified findings produced by the deterministic intelligence engine.

It does not independently invent civic events, numbers, locations, causes, or other facts. The explanation uses hedged language such as:

- possible correlation
- coincides with
- may be related
- suggests

rather than presenting an unverified causal relationship as fact.

If the OpenAI API is unavailable, the system automatically falls back to a deterministic explanation template. This means the core CityPulse intelligence pipeline remains functional even when the optional AI explanation service is unavailable.

---

## API

The API is implemented through the Next.js application backend.

| Method | Route                   | Purpose                                                                                       |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| GET    | /api/state              | Live snapshot containing signals, anomalies, correlations, pulse, feeds, insights, and alerts |
| POST   | /api/scenario/reset     | Reset the city to the normal state                                                            |
| POST   | /api/scenario/advance   | Advance the scripted Zone-3 scenario by one step                                              |
| POST   | /api/live-event         | Generate a new synthetic live civic event                                                     |
| GET    | /api/zones              | Retrieve civic zones                                                                          |
| GET    | /api/events             | Retrieve civic events                                                                         |
| GET    | /api/anomalies          | Retrieve detected anomalies                                                                   |
| GET    | /api/correlations       | Retrieve detected correlations                                                                |
| GET    | /api/insights           | Retrieve generated intelligence insights                                                      |
| GET    | /api/alerts             | Retrieve civic alerts                                                                         |
| GET    | /api/events/:id         | Retrieve a single civic event                                                                 |
| POST   | /api/alerts/:id/resolve | Resolve an alert                                                                              |

---

## Application screens

CityPulse contains six primary application screens:

1. Overview
2. Live Map
3. Intelligence
4. Events
5. Alerts
6. Historical Replay

### Overview

The main city-health dashboard displays:

- overall civic pulse
- zone health
- weather signals
- traffic signals
- transit signals
- civic incidents
- active alerts
- recent live activity

### Live Map

Interactive Leaflet map displaying:

- Jaipur
- civic zones
- zone pulse scores
- live civic events
- event locations
- Jaipur landmarks
- geographic context

Current landmark context includes:

- Hawa Mahal
- City Palace
- Jantar Mantar
- Albert Hall Museum

Landmarks use their own real-world coordinates and are associated with the civic zone containing them.

### Intelligence

Displays the analytical layer including:

- detected anomalies
- correlations
- evidence
- confidence
- signal relationships
- grounded explanations

### Events

Provides a chronological view of civic events and their current status.

Events can move through:

Generated → Active → Resolved

Active events affect the current city snapshot, while resolved events remain available as historical records.

### Alerts

Centralized alert monitoring with:

- alert type
- severity
- zone
- message
- status
- timestamp
- resolution controls

### Historical Replay

Provides the foundation for exploring civic activity over time and replaying historical event sequences.

---

## Demo scenario: Zone-3 scripted flow

The deterministic demo scenario is centered on Zone 3 — Civic Center.

### 1. Normal state

Open CityPulse with the city in a normal state. The zones begin with healthy Civic Pulse values.

### 2. Start the scenario

Click Play Zone-3 Scenario or use Next to manually advance one step at a time.

### 3. Heavy rainfall

Heavy rainfall begins in Zone 3.

```text
Weather signal
      ↓
Rainfall anomaly
```

### 4. Traffic spike

Traffic incidents increase in the same zone.

```text
Rainfall anomaly
      ↓
Traffic anomaly
```

### 5. Transit delays

Transit delays increase.

```text
Rainfall anomaly
      ↓
Traffic anomaly
      ↓
Transit anomaly
```

### 6. Intelligence detection

The deterministic intelligence engine identifies abnormal signals and evaluates their relationship.

```text
Same zone
+
Time overlap
+
Anomaly strength
+
Signal relationship
```

The system can then surface a possible correlation with a calculated confidence score.

### 7. Grounded AI insight

The verified findings are passed to the AI explanation layer. The AI converts the structured evidence into a short plain-language explanation.

### 8. Alert

A corresponding civic alert can appear in the Alert Center.

### 9. Explore

The user can then explore:

- Intelligence
- Evidence
- Event timeline
- Map
- Alerts
- Historical state

This demonstrates the complete end-to-end CityPulse intelligence workflow.

---

## Live event lifecycle

CityPulse also supports automatically generated synthetic live events outside the scripted scenario.

```text
Generate
   ↓
Active
   ↓
Expires
   ↓
Resolved
```

Current simulated event lifetimes are approximately:

- Weather: 20–30 seconds
- Traffic: 25–35 seconds
- Transit: 30–40 seconds

When an event expires, it is resolved and no longer contributes to the active civic snapshot. Historical event records remain available.

---

## Automatic live simulation

When the scripted scenario is not playing, CityPulse can automatically generate synthetic live civic events.

---

## Summary

CityPulse is designed to turn noisy civic signals into understandable, timely, and useful neighborhood intelligence — blending deterministic analytics, explainable correlation logic, and grounded AI explanations into a clear operational view of urban health.

The frontend periodically requests a new live event.

The dashboard refreshes its state automatically.

This creates a continuously changing demonstration environment without requiring external civic APIs.

The live simulation supports:

New event generation
↓
Database persistence
↓
Dashboard update
↓
Pulse recalculation
↓
Anomaly detection
↓
Potential alert generation
↓
Event expiration
↓
Resolution

## Jaipur civic zones

The current prototype contains four geographic civic zones.

Zone Name
Zone 1 Pink City
Zone 2 C-Scheme
Zone 3 Civic Center
Zone 4 Malviya Nagar

Each zone contains:

Zone ID
Label
Name
City
Latitude
Longitude
Radius

The zones are used by the intelligence engine for:

Geographic grouping
Civic Pulse calculation
Event association
Anomaly detection
Correlation detection
Alert generation
Jaipur landmark context

CityPulse includes recognizable Jaipur landmarks as geographic context points.

Current landmarks:

Landmark Associated Zone
Hawa Mahal Zone 1 — Pink City
City Palace Zone 1 — Pink City
Jantar Mantar Zone 1 — Pink City
Albert Hall Museum Zone 2 — C-Scheme

Landmarks are not treated as separate civic zones.

They use their own coordinates and are linked to the relevant civic zone through zoneId.

This allows users to understand civic conditions using recognizable real-world locations without changing the underlying zone model.

## Setup

1. Create Supabase project

Create a free Supabase project.

Then run:

supabase_migration.sql

in the Supabase SQL Editor.

The migration creates:

zones
civic_events
anomalies
correlations
insights
alerts
sim_state

and configures the required Row Level Security policies.

2. Configure environment variables

Create a local .env file.

Use:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

The OpenAI credentials are used only by the server-side AI explanation layer.

Do not expose SUPABASE*SECRET_KEY or OPENAI_API_KEY through any NEXT_PUBLIC*\* variable.

3. Install dependencies

Using Yarn:

yarn install

or using npm:

npm install 4. Start the development server

Using Yarn:

yarn dev

or using npm:

npm run dev

The Next.js development server will normally run at:

http://localhost:3000 5. Production build

Build the application with:

yarn build

or:

npm run build

The production build should complete successfully before deployment.

## Security

Secret credentials are server-only and must never be exposed in browser code.

## Environment variables

The following values must remain private:

SUPABASE_SECRET_KEY
OPENAI_API_KEY

They must never be committed to GitHub.

## Public configuration

Only intentionally public configuration should use:

NEXT*PUBLIC*\*

For Supabase, the publishable/anonymous client key can be used by the browser according to the project's RLS policies.

## Row Level Security

Supabase Row Level Security is enabled.

The current architecture uses:

Public/client reads
↓
Supabase RLS policies

Server-side writes
↓
Server-only Supabase secret key

## Environment file protection

.env is ignored by Git.

Recommended .gitignore entries:

.env
.env.*
!.env.example
*token.json\*
_credentials.json_

## Data privacy

The current prototype uses synthetic/public civic data and does not require personal user data for its core functionality.

## Git workflow

GitHub is the source of truth for the project.

Recommended workflow:

Local VS Code
↓
Git
↓
GitHub
↓
Vercel

Check the current state:

git status

Stage changes:

git add .

Commit:

git commit -m "Update CityPulse"

Push:

git push

Before pushing, verify that no secret files or API keys are included.

## Deployment

CityPulse is designed for deployment using Vercel.

Deployment flow:

GitHub Repository
↓
Vercel Project
↓
Configure Environment Variables
↓
Production Build
↓
Deployment

Required production environment variables:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
OPENAI_API_KEY
OPENAI_MODEL

The .env file itself must never be uploaded to the repository.

## Project structure

citypulse/
│
├── app/
│ ├── api/
│ │ └── [[...path]]/
│ │ └── route.js
│ │
│ ├── page.js
│ └── layout.js
│
├── components/
│ ├── civic/
│ │ └── CivicMap.jsx
│ │
│ └── ui/
│
├── lib/
│ ├── civic/
│ │ ├── config.js
│ │ ├── synthetic.js
│ │ ├── intelligence.js
│ │ ├── ai.js
│ │ └── store.js
│ │
│ └── supabase/
│ └── server.js
│
├── public/
│
├── supabase_migration.sql
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md

## Core modules

lib/civic/config.js

Contains:

City configuration
Civic zones
Jaipur landmarks
Baselines
Anomaly thresholds
Correlation thresholds
Confidence weights
Civic Pulse weights
lib/civic/synthetic.js

Responsible for:

Normal synthetic events
Live synthetic events
Event generation
Event expiration
Simulation data

The module produces normalized CivicEvent objects.

lib/civic/intelligence.js

Responsible for:

Signal aggregation
Zone-level calculations
Anomaly detection
Correlation detection
Confidence calculation
Civic Pulse calculation
Snapshot generation

This is the deterministic intelligence core of CITYPULSE.

lib/civic/ai.js

Responsible for:

Grounded AI explanation
Structured finding preparation
OpenAI API communication
Deterministic fallback explanations

The module ensures that the AI receives only verified structured findings.

lib/civic/store.js

Responsible for:

Supabase reads
Supabase writes
Civic event persistence
Snapshot construction
Database interaction
lib/supabase/server.js

Contains the server-only Supabase client.

Sensitive credentials must never be imported into browser/client-side code.

components/civic/CivicMap.jsx

Responsible for:

Leaflet map initialization
Civic zone rendering
Landmark rendering
Civic event markers
Map interactions
Geographic visualization

Architecture overview
┌─────────────────────────────┐
│ CITYPULSE UI │
│ Next.js + React │
└─────────────┬───────────────┘
│
▼
┌─────────────────────────────┐
│ API / Server │
│ Next.js API Routes │
└─────────────┬───────────────┘
│
┌─────────────────┼─────────────────┐
│ │ │
▼ ▼ ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Civic Data │ │ Intelligence │ │ AI Explanation│
│ Adapters │ │ Engine │ │ Layer │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
│ │ │
└─────────────────┼─────────────────┘
│
▼
┌─────────────────────────────┐
│ Supabase PostgreSQL │
│ Civic Data Store │
└─────────────────────────────┘

## Intelligence pipeline

Civic Signals
↓
Normalization
↓
CivicEvent
↓
Zone Aggregation
↓
Anomaly Detection
↓
Correlation Detection
↓
Confidence Calculation
↓
Civic Pulse
↓
Grounded AI Explanation
↓
Alerts + Dashboard

## Future scope

CityPulse is designed so that the current synthetic data layer can eventually be replaced or supplemented with real civic data sources.

Potential future integrations include:

Traffic APIs
Public Transit APIs
Open Government Data
Environmental Sensors
Air Quality Data
Road Conditions
Water Levels
Public Safety Feeds
Power Outage Data

Future intelligence capabilities can include:

Advanced anomaly detection
Historical trend analysis
Predictive disruption detection
Machine learning
Natural-language civic queries
Agentic monitoring
Push notifications
Email alerts
Multi-city support
Mobile applications

## Multi-city expansion

The current prototype is configured for Jaipur.

The architecture can later support multiple cities:

CityPulse
│
├── Jaipur
├── Delhi
├── Mumbai
├── Bengaluru
└── Hyderabad

Each city can define:

Geographic center
Civic zones
Landmarks
Data sources
Baselines
Thresholds

The same intelligence engine can then operate across different cities.

## Current prototype boundaries

CityPulse is a civic intelligence prototype.

The current implementation uses a hybrid data model: real current weather observations from WeatherAPI, combined with synthetic traffic, transit, and civic incident streams for deterministic demonstration and intelligence testing.

Therefore:

Synthetic incidents should not be interpreted as real-world incidents.
Civic Pulse is an application-level indicator and not an official government measurement.
Correlations should not be interpreted as confirmed causation.
AI explanations are based on structured findings and are not independent verification.
The application is intended for civic awareness and decision support, not emergency dispatch or official emergency response.

## Core design principles

Reliability first

The MVP should remain demonstrable and functional without depending on optional external services.

Deterministic intelligence

Important analytical decisions are produced by transparent deterministic logic.

Grounded AI

AI is used to explain verified findings rather than invent civic information.

Explainability

Users should be able to understand why an anomaly or correlation was detected.

Geographic context

Civic events are connected to recognizable geographic areas and real-world landmarks.

Correlation ≠ causation

The system explicitly distinguishes statistical or temporal overlap from confirmed causal relationships.

Extensibility

New data providers and civic signal types should be possible without rewriting the entire intelligence engine.

## Hackathon demo value

The core CITYPULSE demonstration shows a complete end-to-end journey:

Normal city
↓
Live civic change
↓
New event
↓
Signal stress
↓
Anomaly
↓
Multiple overlapping signals
↓
Possible correlation
↓
Evidence
↓
Confidence
↓
Grounded explanation
↓
Alert
↓
Human exploration

This demonstrates the central value of CityPulse:

Turning fragmented civic signals into understandable neighborhood intelligence.

## Project status

Current implementation includes:

✓ Jaipur city configuration
✓ Four civic zones
✓ Jaipur landmark context
✓ Real weather observations via WeatherAPI
✓ Synthetic traffic signals
✓ Synthetic transit signals
✓ Common CivicEvent model
✓ Live event generation
✓ Event expiration
✓ Event resolution
✓ Civic Pulse
✓ Deterministic anomaly detection
✓ Correlation detection
✓ Transparent confidence calculation
✓ Grounded OpenAI explanation
✓ Deterministic AI fallback
✓ Alert Center
✓ Live activity notifications
✓ Interactive Leaflet map
✓ Responsive mobile navigation
✓ Zone-3 deterministic demo scenario
✓ Supabase PostgreSQL
✓ Row Level Security
✓ Git/GitHub workflow
✓ Vercel deployment architecture

## Development workflow

The project follows an MVP-first development workflow:

Problem Statement
↓
Requirements Breakdown
↓
MVP / Features
↓
Architecture
↓
UI / UX
↓
Backend
↓
Database
↓
Authentication / Security
↓
Integration
↓
Intelligence
↓
Advanced Features
↓
Testing
↓
Git / GitHub
↓
Deployment
↓
Demo
↓
Presentation

The priority is:

Reliability
↓
Core functionality
↓
Data correctness
↓
Intelligence
↓
User experience
↓
Advanced features

## Final project summary

CityPulse is a live civic intelligence and neighborhood health platform designed to transform fragmented civic signals into a unified, understandable view of city conditions.

It combines:

Weather

- Traffic
- Transit
- Civic Events
- Geographic Context
- Anomaly Detection
- Correlation Analysis
- Evidence
- Confidence Scoring
- Grounded AI
- Alerts

into one application.

The current prototype focuses on Jaipur and uses a hybrid data model: real current weather observations from WeatherAPI combined with synthetic traffic, transit, and civic incident streams to demonstrate the complete intelligence workflow.

The architecture is designed to evolve toward real civic data, advanced analytics, predictive intelligence, additional cities, and richer real-time capabilities.

The core idea remains simple:

See what's happening. Understand why it matters.

```

```
