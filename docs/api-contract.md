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
