# API contract (v0.1)

The agreement between frontend, backend and ml. The backend implements it, the frontend calls it, ml produces the files behind the data endpoints. Change it only through a PR reviewed by all three leads, and bump the version.

Base URL: `http://localhost:8080` in development. All responses are JSON.

## Shared values

- `status`: `"normal" | "watch" | "alert"` (plus `"no_data"` where nothing is available).
- `source`: `"NASA" | "general human data (PhysioNet)" | "environment" | "synthetic"`. Every response that returns readings includes it.
- Errors: HTTP 400/404/500 with `{ "error": "plain message", "field": "optional field name" }`.
- Dates: ISO 8601 strings, e.g. `"2026-11-14T08:00:00Z"`.

## Endpoints

| Method | Path | Purpose | Data from |
| --- | --- | --- | --- |
| GET | `/actuator/health` | Is the backend up | backend |
| GET | `/api/crew` | Crew list | backend |
| GET | `/api/crew/{crewId}/summary` | Latest status per indicator, for the dashboard and body map | backend |
| GET | `/api/crew/{crewId}/readings?indicator=heart_rate&days=14` | Time series for charts | backend |
| POST | `/api/crew/{crewId}/checkins` | Submit a check-in, get the evaluated result | backend |
| GET | `/api/nights?subject={id}` | Nightly heart-rate anomaly scores | `ml/outputs/nights_scored.json` |
| GET | `/api/labs?analyte=GLUCOSE` | Inspiration4 bloodwork vs preflight | `ml/outputs/i4_personal_changes.json` |
| GET | `/api/environment/radiation` | ISS radiation dose per day | `ml/outputs/rr1_radiation.json` |

Example payloads are in [samples/](samples/). Fields marked TBD are for the team to settle.

### Indicator ids

`heart_rate`, `blood_pressure`, `blood_sugar`, `body_temperature`, `sleep_hours`, `mood` (the six the challenge names). Optional: `spo2`.

### POST /api/crew/{crewId}/checkins

Request: see [samples/checkin-request.json](samples/checkin-request.json). Response: [samples/checkin-response.json](samples/checkin-response.json).

### GET /api/crew/{crewId}/summary

Response: [samples/summary-response.json](samples/summary-response.json).

## Notes from the frontend (2026-11-14)

- **Crew ids.** The demo uses `crew-01` Maya Okafor (flight engineer), `crew-02` Tomas Reyes (commander), `crew-03` Lena Kowalski (crew medical officer), `crew-04` Kwame Asante (mission specialist). The backend should use the same ids and names (`frontend/src/data/crew.json`).
- **Idempotency.** The frontend's outbox may resend a check-in after a lost response. Every `POST /checkins` carries an `Idempotency-Key` header (the record's UUID). Store it, and return the same result for a repeated key instead of saving twice.
- **Errors.** `400`, `403`, `409` and `422` are treated as final (the check-in stays on the device, marked "Not accepted"). Anything else, or no answer, is retried with backoff.
- **Check-ins.** Readings can be partial: an indicator the crew member skipped is left out of `readings`, not sent as `null`.
- **Radiation.** The frontend expects `{ source, note, unit: "mGy", days: [{ date, gcr, saa, total, accumulated }] }` (see `frontend/src/data/rr1_radiation.json`).
- **Not in the contract yet.** Region detail indicators, stand tests, logging a night (`POST /api/nights/score`) and the whole-crew view. The frontend serves these from its mock API for now; shapes are in `frontend/src/app/api/*/route.js`.
