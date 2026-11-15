# Frontend

Next.js (App Router, JavaScript) app for the crew, the onboard Crew Medical Officer and the ground
medical officer. It talks to the Spring Boot backend in `../backend` for login, crew, alerts, baselines
and monitoring rules. Readings (check-ins, stand tests, sensor days, exams) stay local-first on the device.

## Run

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
npm test         # node:test
npm run build
```

Configuration (names only):

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend base URL. Default `http://localhost:8080`. |

The backend must allow the frontend origin (`FRONTEND_ORIGINS`, default `http://localhost:3000`). For local
HTTP only, the backend needs `SESSION_COOKIE_SECURE=false` or the browser drops the session cookie.

## Sign-in

- **Backend accounts.** Login name + password, `POST /api/auth/login`. The backend decides the role
  (`ASTRONAUT` or `NASA_OFFICER`); `GET /api/auth/me` restores it on reload. Accounts are provisioned by an
  administrator: see `../docs/demo-account-provisioning.md`. No password is stored in this app.
- **Explore with demo data.** Offered when the backend is not reachable. Opens the local demo crew on
  bundled synthetic data, labelled "Demo data" throughout.

Roles in the UI:

| Account | Screens |
| --- | --- |
| Astronaut | Today, Vitals, Sleep, Station, More (My alerts, Knowledge hub, ML assessment, Activities, …) |
| Astronaut `crew-03` (Lena, onboard CMO) | Crew (local whole-crew view), My data ▸, Station, More |
| `NASA_OFFICER` (ground medical officer) | Crew (live roster + local health status), Alerts, Baselines, Rules, More |

## Data sources

| Screen | Source |
| --- | --- |
| Login, identity, crew roster, alerts (list, detail, acknowledge, resolve), baselines, rules | **Live** backend |
| Indicator cards, sleep, labs, station, stand tests, check-ins, CMO crew view | **Local** bundled synthetic data + this device |
| ML assessment | **Demo data** (`src/mocks/mlAssessment.js`), model not connected yet |

## Backend endpoints used

| Method | Path | Where |
| --- | --- | --- |
| GET | `/api/auth/csrf` | `lib/api.js` (token kept in memory, sent as `X-CSRF-TOKEN` on every POST) |
| POST | `/api/auth/login` | Landing |
| POST | `/api/auth/logout` | Account menu |
| GET | `/api/auth/me` | App start |
| GET | `/api/crew` | Officer crew, alerts filter, baselines, rules |
| GET | `/api/crew/me` | `services/crewService.js` |
| GET | `/api/alerts/me` | My alerts (astronaut) |
| GET | `/api/alerts` | Alerts (officer), open-alert counts |
| GET | `/api/alerts/{id}` | Alert detail |
| POST | `/api/alerts/{id}/acknowledge` | Astronaut and officer |
| POST | `/api/alerts/{id}/resolve` | Officer, body `{ note }` (1–2000 chars) |
| GET | `/api/crew/{astronautId}/baselines`, `/versions` | Baselines (read only) |
| GET | `/api/monitoring-rules` | Rules (read only) |

## Where things are

| Path | What |
| --- | --- |
| `src/App.jsx` | App shell: landing, crew/CMO tabs and views |
| `src/views/OfficerApp.jsx` | Ground medical officer shell |
| `src/lib/api.js` | Backend client: CSRF, credentials, error kinds, validators |
| `src/lib/session.js` | Backend identity → app account; sign-out |
| `src/lib/crewAdapter.js` | Backend crew profile → frontend crew view (`crewCode` = local `crewId`) |
| `src/services/` | `crewService`, `alertService`, `baselineService`, `assessmentService`, `healthService` (local) |
| `src/content/knowledge.js` | Knowledge hub, assembled from `whyItMatters.js`, `limits.js` and the check-in how-tos |
| `src/content/limits.js` | Every cited limit and its source |
| `src/app/api/` | Local data routes for bundled synthetic data (not the Java backend) |
| `src/ground/` | `/ground` console (local) |
| `public/health-education/` | Placeholder images, labelled as placeholders |
