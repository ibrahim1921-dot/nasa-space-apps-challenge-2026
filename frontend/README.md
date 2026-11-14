# Crew Health Monitor frontend

Next.js App Router, JavaScript, CSS Modules and CSS variables. All observations in mock mode are synthetic. The frontend displays statuses and guidance returned by the API; it does not implement medical scoring.

## Run without creating an environment file

From PowerShell:

```powershell
cd frontend
npm.cmd install
$env:NEXT_PUBLIC_USE_MOCKS = 'true'
npm.cmd run dev
```

Open http://localhost:3000 and choose one of three fictional crew members.

For the backend, set `NEXT_PUBLIC_USE_MOCKS` to `false` and optionally set `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`). Restart the dev server after changing these variables. `NEXT_PUBLIC_*` values are bundled at build time: rebuild production when switching modes. Only `.env.example` is supplied; no real `.env` file is needed for these commands.

## Source map

```text
frontend/
  .env.example
  scripts/                       # Browser and real-client offline QA
  tests/                         # API/sample, routine/queue, component tests
  src/
    app/
      page.js                    # Crew picker
      dashboard/ checkin/ trends/ sleep/ labs/ environment/ about/
      layout.js not-found.js icon.svg
    components/                  # Header, picker, chips, cards, panels, sparklines
    features/
      bodymap/ checkin/ trends/ sleep/ labs/ environment/ routine/
    lib/
      api/                       # client.js, endpoints.js, mock/index.js
      cache/                     # Timestamped local cache and pending queue
      format/                    # Values, units and UTC dates
    content/
      indicators.js missions.js sources.js ui.js
    styles/
      tokens.css globals.css
```

## Routes and endpoints

| Route | Requests |
| --- | --- |
| `/` | `GET /api/crew` |
| `/dashboard` | `GET /api/crew/{crewId}/summary` and six `GET /api/crew/{crewId}/readings?indicator=...&days=14` |
| `/checkin` | `POST /api/crew/{crewId}/checkins` |
| `/trends` | Six `GET /api/crew/{crewId}/readings?indicator=...&days=7|14|30` |
| `/sleep` | `GET /api/nights?subject=...` |
| `/labs` | `GET /api/labs?analyte=GLUCOSE` (and API-advertised analytes) |
| `/environment` | `GET /api/environment/radiation` |
| `/about` | Local content and source links |
| Not found | Local recovery link |

`lib/api/endpoints.js` is the central endpoint registry. `/actuator/health` is supported by the client/mock registry but not polled by the UI. The queue retries its pending requests directly every 30 seconds and on browser `online` events.

## Mock and real behavior

`NEXT_PUBLIC_USE_MOCKS=true` uses `lib/api/mock/` and displays the header's “Demo data” tag. Three fictional crew each have six indicators and 14 default daily readings; history requests support 7/14/30 days. Fixtures include normal, watch, alert and no-data states. Statuses are predetermined examples, never evaluations of entered health numbers.

`false` (also the default when unset) uses the backend URL. Missing response shapes use the provisional adapters documented in [frontend contract assumptions](../docs/frontend-contract-assumptions.md). The shared API contract was not modified. Complete the backend agreement before claiming integration with the real source datasets.

Successful GETs are cached with UTC timestamps in localStorage. Mock and real response caches have separate namespaces. Network failures use the last response for that exact URL and show the offline banner. An empty cache shows an unavailable message. HTTP API errors display their `error` message and do not silently substitute a successful cache result.

Offline submissions persist as pending and retain a stable idempotency key. Mock and real queues are separate so switching modes cannot consume a real pending submission as a demo. On recovery they send in order. Successful submissions update routine completion; rejected API submissions remain visible with the server message and are not automatically repeated. The backend must support `Idempotency-Key` for reliable deduplication after uncertain network failures.

The native modal dialog contains body-region focus, closes on Escape and restores focus to its trigger. The body regions also have labelled buttons. Reduced-motion preferences disable animations. Charts offer accessible table views.

This is a one-click prototype, without authentication. Mood is only included in the selected crew view, but localStorage and the crew picker are not access controls on shared devices. Server-side privacy and an authenticated storage policy remain backend/product work. “Offline” means cached results while the app is loaded or served locally; this is not a service-worker installation for cold launches without the frontend server.

## Verification

```powershell
npm.cmd run lint
npm.cmd test
$env:NEXT_PUBLIC_USE_MOCKS = 'true'
npm.cmd run build
npm.cmd start
```

`next/font/google` downloads Barlow fonts at build time, so a clean build needs Google Fonts network access. Fonts are served locally by the built application.

Tests cover GET cache fallback and errors, sample response compatibility, all fixture endpoints and statuses, streak dates, queue persistence/rejections/concurrency, basic numeric checks, status text and keyboard activation. Vitest uses the Vite JSX transform for `.js` files, without adding a React build plugin.

Browser checks use an already-running local Chromium CDP session on `127.0.0.1:9223`, with a temporary profile. They require Node 22+ and add no packages:

```powershell
node scripts/browser-qa.mjs http://127.0.0.1:3000
```

The mock QA checks all routes on desktop and at 360 px, a complete check-in, modal focus containment/Escape/restoration, and uncaught browser exceptions. Screenshots go to ignored `qa-artifacts/`.

For `scripts/offline-qa.mjs`, separately run the dev server on port 3001 with mocks set to `false`, with no backend on port 8080. The script intercepts browser API requests to establish successful cached data, then removes interception to verify genuine network failures and automatic queued retries. It covers cached crew, dashboard, trends, sleep, lab and environment pages plus empty-cache behavior.

## Suggested commit commands

Run from the repository root. No Git commands were run during implementation.

```powershell
git switch -c frontend/setup
git add frontend docs/frontend-contract-assumptions.md docs/data-sources.md
git commit -m "feat(frontend): add crew health monitor and offline workflows"
git push -u origin frontend/setup
```

If `frontend/setup` already exists, use `git switch frontend/setup` instead of creating it.
