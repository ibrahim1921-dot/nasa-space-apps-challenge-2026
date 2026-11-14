# Frontend

Next.js (App Router, JavaScript) app for the crew and the Crew Medical Officer.

## Run

```bash
cd frontend
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm run dev                  # http://localhost:3000
npm test                     # node:test, 80+ tests on the scoring, outbox and contract mapping
npm run build
```

## Two data modes

| `NEXT_PUBLIC_USE_MOCKS` | Where data comes from |
| --- | --- |
| `true` (default) | The app's own mock API in `src/app/api` plus the bundled files in `src/data`. Works with no backend, so the demo never breaks. |
| `false` | The Java backend at `NEXT_PUBLIC_API_URL` for what `docs/api-contract.md` covers today: health check, check-ins (sent by the outbox) and radiation. The rest stays on the mock API until the backend serves it. |

Check-ins are always scored and saved on the device first, so the app keeps working when the onboard server is down. When the backend is reachable, the outbox sends each check-in to `POST /api/crew/{crewId}/checkins` and the backend's result becomes the official one.

## Where things are

| Path | What |
| --- | --- |
| `src/App.jsx` | App shell: landing, header, tabs, views |
| `src/views/` | Dashboard, Sleep & recovery, Lab baseline, Environment, Stand test, Crew Medical Officer, About |
| `src/components/` | Body map, region drawer, cards, check-in form, charts |
| `src/services/healthService.js` | The one data-access layer |
| `src/lib/backend.js` | Mock/real switch and the backend fetch |
| `src/lib/contractMap.js` | App readings ⇄ API contract ids |
| `src/hooks/useOnboard.jsx` | Demo identity, server status, outbox loop |
| `src/lib/*.js` | Pure logic (scoring, baselines, outbox), each with a `.test.js` |
| `src/content/limits.js` | Every cited limit and its source, in one place |
| `src/app/api/` | Mock API, used only in mock mode |
| `src/data/` | Bundled synthetic crew data, PhysioNet nights, Inspiration4 labs, RR-1 radiation |

## Next tasks

1. Bones and muscles: replace the sample rows in `src/mocks/regions.js` with the ML fitness baseline (`ml/outputs/fitness_norms.json`).
2. When the backend serves `GET /api/crew/{crewId}/summary` and `/readings`, load the Crew Medical Officer view from it (see the TODO in `src/views/CrewMedicalOfficer.jsx`).
3. Move nights and labs to the backend once it returns the same shape as `src/app/api/nights` and `src/app/api/labs`.
