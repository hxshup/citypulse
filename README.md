# CityPulse

CityPulse is a Jaipur-focused civic information dashboard. It combines public weather, map/place, and news sources for a searched location with a separate, clearly identified civic-scenario engine. It is not an emergency dispatch service, traffic-navigation service, or official city alert system.

## Run locally

Requirements: Node.js 22.5+ (Node 24 LTS recommended) and Yarn 1.

```powershell
corepack yarn install
Copy-Item .env.example .env.local
corepack yarn dev
```

Open `http://localhost:3000`. Live Jaipur weather, place search, city atlas and news do not need API keys. Live road speeds are optional and require a TomTom developer key.

## Live data sources

| Feature | Provider | Key | Coverage and limitations |
| --- | --- | --- | --- |
| Current weather for the focused area | [Open-Meteo](https://open-meteo.com/) | None | Model-based current conditions for the searched point; not a street-level weather station observation. |
| Jaipur area, landmark and hospital search | [Nominatim / OpenStreetMap](https://operations.osmfoundation.org/policies/nominatim/) | None | Search is bounded to Jaipur and throttled/cached server-side. OpenStreetMap coverage and names can be incomplete. |
| City atlas: neighbourhoods, hospitals, landmarks | [Overpass / OpenStreetMap](https://www.openstreetmap.org/copyright) | None | Public OSM entries in the Jaipur service area; cache results and respect the upstream service. |
| Local news and incident-related headlines | Google News RSS | None | Headlines are search results linked to the publisher, not official incident reports. Matching an incident word is only a news mention, not a verified emergency. |
| Nearest road-segment traffic speed | TomTom Traffic | `TOMTOM_API_KEY` | Optional developer API, subject to TomTom account, geographic coverage, quotas, and terms. One selected point is not a citywide traffic feed. |

Open weather and news data is fetched for Jaipur and then for the selected search result. The page does not fabricate live weather, traffic, crowd, or emergency reports. When the optional traffic key is missing or a provider has no reading, the UI states that explicitly. No universal free public Jaipur live traffic/official incident API is assumed to exist.

## Server and storage

The Next.js Node server is also the backend: its `/api/*` handlers validate requests, query public providers, run the existing deterministic analysis, and persist scenario/report data to SQLite. SQLite uses Node's built-in `node:sqlite`, write-ahead logging, foreign keys, parameterized SQL, and transactions; no Supabase account or database service is used.

```text
app/page.js                     Responsive Hindi/English dashboard and Jaipur search
app/api/[[...path]]/route.js    Same-origin REST API, validation, throttling, CSRF checks
lib/civic/providers.js          Open-Meteo, OSM/Nominatim, Overpass, Google News RSS, TomTom
lib/civic/store.js              SQLite schema, persistence and civic snapshot builder
lib/civic/intelligence.js       Existing deterministic anomaly/correlation/pulse engine
lib/civic/synthetic.js          Explicitly demo-only scenario events
components/civic/CivicMap.jsx   Leaflet map, OSM atlas markers, civic scenario events
```

The default database is `.data/citypulse.sqlite` (ignored by Git). Set `CITYPULSE_DB_PATH` to a durable mounted path in production. The SQLite file is a single-host store: back it up, and use a network database or dedicated shared service before horizontally scaling the app. Existing Supabase records are not automatically copied; export/back them up before switching deployments. `supabase_migration.sql`, if present in an older checkout, is legacy-only and is not read by this app.

The demo scenario is user-triggered and writes synthetic data only when its play/advance controls are used. Scenario entries are marked as demo; the application no longer creates random incidents on a timer. A Civic Pulse with no reports is shown as unavailable, not as a perfect score.

## Configuration

Copy `.env.example` to `.env.local`. Values are server-side only:

```dotenv
CITYPULSE_DB_PATH=.data/citypulse.sqlite
TOMTOM_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Open-Meteo, Nominatim, Overpass, and Google News RSS are keyless public endpoints. `TOMTOM_API_KEY` is optional; create and configure your own key through TomTom's developer portal. Never add a secret to a `NEXT_PUBLIC_*` variable or commit it. CityPulse does not supply provider keys.

## Backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Stored civic snapshot and deterministic scenario analysis |
| `GET` | `/api/jaipur/search?q=...` | Search for Jaipur areas and places |
| `GET` | `/api/jaipur/area?lat=...&lon=...&name=...&language=en` | Focused weather, headlines, incident-related news mentions and optional nearest-road traffic |
| `GET` | `/api/jaipur/places?group=all\|areas\|hospitals\|landmarks` | OpenStreetMap city atlas directory |
| `GET` | `/api/zones`, `/api/events`, `/api/anomalies`, `/api/correlations`, `/api/insights`, `/api/alerts` | Civic records and analysis |
| `POST` | `/api/scenario/reset`, `/api/scenario/advance` | Run the explicitly labeled demo scenario |
| `POST` | `/api/alerts/:id/resolve` | Resolve a stored alert |

## Security and privacy

- Provider credentials are read only by the Node server and never returned to the browser.
- The API is same-origin only by default; cross-origin resource sharing is disabled.
- Mutations check browser Origin / Fetch Metadata. Inputs are length- and geographic-bounds-validated.
- Per-IP, per-route in-process request limits protect API and provider endpoints; Nominatim queries are serialized and throttled.
- SQLite access uses parameterized statements and transactions. Responses do not expose exception details.
- The app sends a restrictive Content Security Policy, `frame-ancestors 'none'`, clickjacking/content-type/referrer protections, and a restrictive Permissions Policy.
- For a public deployment, terminate HTTPS at a trusted proxy and add shared Redis/proxy rate limiting, operational monitoring, provider timeout budgets, durable database backups, and abuse controls appropriate to expected traffic. In-process rate limits do not coordinate across multiple server instances.

## Validation

```powershell
corepack yarn build
```

The API smoke suite uses only Python's standard library and mutates demo data.
Run it only against a disposable local database, with the app running in another
terminal:

```powershell
$env:CITYPULSE_DB_PATH = Join-Path $env:TEMP "citypulse-api-smoke.sqlite"
corepack yarn dev
# In a second terminal:
py backend_test.py --allow-mutations
```
