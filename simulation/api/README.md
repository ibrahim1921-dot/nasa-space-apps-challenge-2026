# Local Python simulation API

This is an **unauthenticated, loopback-only development adapter**, not the Spring
Boot backend or a production service. It calls the existing `Simulator`; the
adapter contains no probability model, trained inference, clinical thresholds,
alert logic, database connection, or HTTP sender to another backend.
The separate browser Lab now has an explicitly enabled [officer delivery client](../DELIVERY.md).
It sends directly to Spring Boot, never through Python; this API receives no officer
credentials/session secrets and still performs no backend provisioning or ingestion.

## Launch

From the repository root, with Python 3.11+:

```powershell
python -m simulation.api
```

On the inspected Windows workstation, use the installed interpreter directly:

```powershell
& "$env:LOCALAPPDATA/Programs/Python/Python314/python.exe" -m simulation.api
```

The default URL is `http://127.0.0.1:8765`. Optional `--port` changes the port;
the UI proxy must then be changed to match. Binding to a non-loopback interface
is intentionally unsupported. Ctrl+C stops the owned server/driver.

The process starts READY, with no generated observations. Its single background
driver advances the Python engine every approximately 250 ms only while RUNNING.
The browser only polls state; opening more tabs does not accelerate the clock.
The driver uses supplied monotonic intervals capped at 500 ms and does not catch
up laptop sleep or long blocked intervals. Configured speed means virtual seconds
per driver second, not an exact real-time guarantee under load.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/catalog` | Fictional profiles, five presets, canonical families/metrics/units/cadences |
| GET | `/api/manifest` | Complete original run manifest, workspace ID, and run ID of the active or selected engine run |
| GET | `/api/state` | Engine state, clock, run IDs/origins, retained count, controls, reference values and plot points |
| GET | `/api/v1/observations` | Bounded pages of complete original synthetic observation envelopes |
| POST | `/api/start` | READY -> RUNNING |
| POST | `/api/pause` | RUNNING -> PAUSED |
| POST | `/api/resume` | PAUSED -> RUNNING |
| POST | `/api/reset` | New run/origin at current virtual time, READY; optional integer `seed` |
| POST | `/api/controls` | Update scenario, activity, stress, sleep restriction, radiation intensity or time scale without resetting |
| POST | `/api/step` | Explicitly advance 1 or 28 virtual days while RUNNING |

State requests may select `astronaut_id` and `run_id` query parameters. Profile
selection only filters the view: all three fictional subjects advance on the same
Python clock. Earlier runs remain selectable after reset. No records are deleted.
The latest 120 actual measured points per metric/run/profile are returned; the
engine still retains the full underlying observations. Sparse monthly/weekly
series remain sparse, with no fake browser updates. Muscle kgf and kg are separate
metric series/scopes. Original/context references come from the Python parameters
and observation snapshots. They are not medical decision limits.

POST bodies must be JSON objects and include `X-Simulation-Lab: 1`; even bodyless
commands use `{}`. Optional `expected_run_id` rejects stale mutations with `409`.
Invalid transitions return `409`; unknown profiles/runs/endpoints return `404`;
invalid controls/fields return `400`. Controls use the existing Python validation:
activity/stress [0,1], sleep restriction [0,8] hours, radiation intensity [0,10],
time scale [1,604800]. The adapter translates sleep restriction to the engine's
`sleep_hours = 8 - restriction`. Elevated Radiation adds the engine's existing
scenario multiplier; the slider remains its additional multiplier.

Changing to Exercise or Recovery starts that scenario phase at the current tick,
not at the original run start. Changes to sliders within the same scenario do not
restart it. The engine retains latent state and cumulative dose; reset alone
creates a new radiation origin. Fractional virtual time is preserved when speed
changes. Controls and HTTP requests are serialized with the driver under a lock.

One API process is one shared lab workspace. Tabs/operators share controls; this
is not a per-user session or account system. Up to 50,000 observations and 50 runs
are retained in memory. The API pauses before exceeding that observation budget,
shows a message, and retains history. Reset does not bypass the budget by deleting
data. Restarting the process clears this **in-memory synthetic workspace**; there
is no durable storage or PostgreSQL history to delete. Durable capture and
recorded control schedules are future integration work.

## Active run manifest export (Phase 4C.6B)

```powershell
Invoke-RestMethod 'http://127.0.0.1:8765/api/manifest'
```

Exposes the exact, full original run manifest of the running `Simulator` instance,
bound to the active API workspace and engine run. Backend simulation capture registration
(`POST /api/simulation/captures`) requires this complete manifest snapshot to approve
identities, and observation ingestion validates that ingested envelopes match its
engine version, seed, start time, and profile UUIDs.

Response wrapper:

```json
{
  "schema_version": "astrohealth.simulation.manifest.v1",
  "synthetic": true,
  "workspace_id": "<API workspace UUID>",
  "run_id": "<engine run UUID>",
  "manifest": {
    "schema_version": "astrohealth.simulation.run.v1",
    "engine_version": "0.1.0",
    "synthetic": true,
    "run_id": "<engine run UUID>",
    "configuration": {
      "seed": 42,
      "start_at": "2026-01-01T08:00:00Z",
      "scenario": "normal",
      "tick_minutes": 15,
      "time_scale": 86400,
      "stress": 0.1,
      "activity": 0.7,
      "sleep_hours": 8,
      "radiation_mgy_per_day": 0.25,
      "radiation_multiplier": 1,
      "cadences": {
        "heart_rate": 15,
        "blood_pressure": 60,
        "blood_glucose": 360,
        "body_temperature": 60,
        "sleep_hours": 1440,
        "mood": 720,
        "muscle": 10080,
        "bone_mineral_density": 40320,
        "cumulative_radiation": 15
      },
      "profiles": [
        {
          "astronaut_id": "<deterministic UUID>",
          "crew_code": "sim-crew-01",
          "original": { ... },
          "contexts": { ... }
        }
      ]
    },
    "warning": "Synthetic demo parameters, not clinical guidance, a trained model, or an ingestion API."
  }
}
```

Optional query parameter `run_id` retrieves a retained past run's manifest from the current
workspace. An unknown `run_id` returns `404`; unknown query parameters return `400`.
Reset advances the engine to a new run with a new `start_at` and `run_id`, which becomes
the active manifest. Process restart generates a new `workspace_id`.

## Complete observation export (Phase 4C.1)

```powershell
Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/observations?limit=100'
```

The process must have generated observations first (Start, then let the driver
advance or use Step). READY with no history returns a successful empty page.
Unlike `/api/state`, this endpoint exports every retained original engine envelope,
not chart points. See [a complete one-record response](../examples/export-page.json).
Its wrapper is:

```json
{
  "schema_version": "astrohealth.simulation.export.v1",
  "synthetic": true,
  "workspace_id": "<random UUID for this API workspace>",
  "durable": false,
  "after": 0,
  "through": 300,
  "last_sequence": 100,
  "retained_observations": 300,
  "record_limit": 50000,
  "items": [{"sequence": 1, "envelope": "<complete original observation object>"}],
  "next_url": "/api/v1/observations?workspace_id=<UUID>&after=100&limit=100&through=300",
  "checkpoint_url": null
}
```

This abbreviated wrapper illustrates the contract; the linked example contains
an actual object, including subtype values, metric units and baseline parameters.
`items` contains up to `limit` objects (default 100, maximum 500). Query fields:

| Field | Meaning |
| --- | --- |
| `workspace_id` | Required with `after` or `through`; identifies this in-memory workspace |
| `after` | Exclusive append sequence, default 0 |
| `through` | Inclusive snapshot upper sequence; default current retained count |
| `limit` | Integer 1–500; page size, not a chart truncation |

All observations across all fictional profiles and retained runs share an append
sequence starting at 1. It follows engine emission order, including separate grip
and mass observations. It is not a measurement-time sort or a real medical ID.
The first request freezes `through` under the same lock used by the driver and
controls. Follow each returned relative `next_url` against this API base URL
unchanged until it is null. New observations cannot shift those pages. Retrying
the same frozen range returns the same items; current `retained_observations` may
increase. Save progress only after successfully processing a page.

On the last page, `checkpoint_url` resumes after the completed range and omits
`through`, so requesting it captures a new snapshot of records appended since.
Drain its `next_url` chain before polling the next checkpoint. Persist/reuse the
checkpoint rather than starting again at sequence 0. An empty poll retains the
same position. Concurrent consumers have independent checkpoints; reads do not
acknowledge, consume or delete history. The API does not guarantee exactly-once
delivery to a consumer that retries: deduplicate by `(workspace_id, sequence)`.
Future backend ingestion still needs durable receipts and payload conflict checks.

Every envelope preserves `source_record_id`, fictional UUID/crew code, indicator,
storage kind, scope descriptor, units, activity context, `measured_at`, subtype
values, baseline snapshots, run ID, virtual tick, controls and synthetic provenance.
Radiation retains its explicit accumulation origin in the scope. Measurement time
is virtual UTC time, not HTTP receipt time. Mood remains a numeric synthetic score
on the named demo scale: it is **not an astronaut-submitted clinical assessment**.
No real identity mapping, scope provisioning, thresholds or alerts happen here.

Reset preserves old sequences and records and creates a new run/origin. Export
is also available while READY or PAUSED. History is bounded by the existing 50,000
record / 50-run limits; generation pauses or reset is rejected before exceeding
them, with no silent eviction. Pages are copied in bounded slices and export does
not copy the entire engine archive on every request. A record-count bound is not
an exact byte-memory guarantee.

**Not durable:** restart/crash loses unexported history. A new workspace gets a
new random UUID even if seed-based engine IDs repeat. Requests using the old
workspace return `409`; clients must report the interrupted capture/data loss,
not silently attach a stale checkpoint to a new workspace. Starting a new export
without the previous workspace cannot recover lost records. Save downloaded pages
externally if needed; the service itself writes no export archive. Workspace IDs
and sequence numbers are not production authentication credentials.

Invalid, empty, repeated or unknown query fields and out-of-range sequences return
`400`; stale workspace IDs return `409`. Existing Host/Origin checks apply to this
GET endpoint. It remains unauthenticated and loopback-only, with `no-store`
responses; never expose the service publicly.

## Local security boundary

- Binds only `127.0.0.1`, checks an exact local Host header and allows only explicit
  loopback UI origins on 5173/4173, plus its own origin. No wildcard credentialed
  CORS, cookies, real AstroHealth accounts or astronaut/officer authentication.
- Cross-site mutation protection requires JSON and a custom header; CORS
  preflights reject foreign origins and extra headers. This header is **not an
  authentication secret** and does not protect against untrusted local processes.
- POST bodies are capped at 4096 bytes; transfers/timeouts and control/run bounds
  are deliberately narrow. The server does not serve arbitrary filesystem paths.
- Python `http.server` is not a production framework. Do not expose either API or
  Vite through a LAN bind, public reverse proxy, port-forwarding service or tunnel.
  The guard does not defend against malware, hostile browser extensions, XSS in
  an allowed local app, or other users/processes on the machine.
- Request bodies and measurements are not logged by the HTTP handler. Use only
  fictional identities and synthetic inputs. Production auth, authorization,
  TLS, rate limits, durable storage and ingestion are not implemented here.

See the official [Python HTTP server limitations](https://docs.python.org/3/library/http.server.html).

## Tests

From the repository root:

```powershell
python -m unittest discover -s simulation/tests -v
```

The adapter tests use temporary loopback ports and the actual Python engine.
They test lifecycle, retained history, late preset changes, slider effects,
cadences, canonical units, reference values, memory-budget protection, and
Host/Origin/body/header guards. They do not contact the development database.
