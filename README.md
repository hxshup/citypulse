# CityPulse

CityPulse is a Jaipur-focused live public-information dashboard. It combines current weather, local news headlines, and mapped Jaipur places for a searched location. It is not an emergency dispatch service, traffic-navigation service, or official city alert system.

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

The Next.js Node server provides the backend: its `/api/*` handlers validate requests and query public providers. Live weather, news, and place search do not require a database. Local development can use SQLite for stored civic reports; Vercel can use MongoDB Atlas for optional persistent reports. Neither deployment path uses Supabase.

```text
app/page.js                     Responsive Hindi/English dashboard and Jaipur search
app/api/[[...path]]/route.js    Same-origin REST API, validation, throttling, CSRF checks
lib/civic/providers.js          Open-Meteo, OSM/Nominatim, Overpass, Google News RSS, TomTom
lib/civic/store.js              Optional SQLite / MongoDB persistence and empty civic snapshot
components/civic/CivicMap.jsx   Leaflet map with OpenStreetMap place markers
```

Local SQLite defaults to `.data/citypulse.sqlite` (ignored by Git); set `CITYPULSE_DB_PATH` to use another writable local path. The app does not depend on SQLite or MongoDB to show live public data, so Vercel's ephemeral filesystem will not block the dashboard. Set `MONGODB_URI` and `MONGODB_DATABASE` only if you need durable storage for future verified civic reports. Existing Supabase records are not automatically copied. On first startup after this release, the store removes synthetic demo events and their derived test findings while preserving configured zone records.

## Configuration

Copy `.env.example` to `.env.local`. Values are server-side only:

```dotenv
CITYPULSE_DB_PATH=.data/citypulse.sqlite
MONGODB_URI=
MONGODB_DATABASE=citypulse
TOMTOM_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

For Vercel, the live dashboard works without database setup. To enable persistent report storage, create a MongoDB Atlas cluster and database user, allow connections from your deployment using appropriate network access settings, then set `MONGODB_URI` and `MONGODB_DATABASE` in the Vercel project's Environment Variables and redeploy. Never use `NEXT_PUBLIC_*` for secrets or commit credentials. Without MongoDB, stored-report endpoints return an empty snapshot instead of trying to write to ephemeral SQLite.

Open-Meteo, Nominatim, Overpass, and Google News RSS are keyless public endpoints. `TOMTOM_API_KEY` is optional; create and configure your own key through TomTom's developer portal. CityPulse does not supply provider credentials.

## Backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Stored civic snapshot (empty when no verified reports have been ingested) |
| `GET` | `/api/jaipur/search?q=...` | Search for Jaipur areas and places |
| `GET` | `/api/jaipur/area?lat=...&lon=...&name=...&language=en` | Focused weather, headlines, incident-related news mentions and optional nearest-road traffic |
| `GET` | `/api/jaipur/places?group=all\|areas\|hospitals\|landmarks` | OpenStreetMap city atlas directory |
| `GET` | `/api/zones`, `/api/events`, `/api/anomalies`, `/api/correlations`, `/api/insights`, `/api/alerts` | Read-only stored reports (no synthetic events are generated) |

## Security and privacy

- Provider credentials are read only by the Node server and never returned to the browser.
- The API is same-origin only by default; cross-origin resource sharing is disabled.
- Mutations check browser Origin / Fetch Metadata. Inputs are length- and geographic-bounds-validated.
- Per-IP, per-route in-process request limits protect API and provider endpoints; Nominatim queries are serialized and throttled.
- SQLite access uses parameterized statements and transactions. MongoDB credentials remain server-side. Responses do not expose database credentials or exception details.
- The app sends a restrictive Content Security Policy, `frame-ancestors 'none'`, clickjacking/content-type/referrer protections, and a restrictive Permissions Policy.
- For a public deployment, terminate HTTPS at a trusted proxy and add shared Redis/proxy rate limiting, operational monitoring, provider timeout budgets, durable database backups, and abuse controls appropriate to expected traffic. In-process rate limits do not coordinate across multiple server instances.

## Validation

```powershell
corepack yarn build
```

The API smoke suite uses only Python's standard library and is read-only. Run it
with the app running:

```powershell
corepack yarn dev
# In a second terminal:
py backend_test.py
```
