# Health alert API — Phase 4E.2

These APIs retrieve and transition existing alerts. They do not generate alerts,
enable evaluation, backfill data, provision thresholds, invoke ML or deliver a UI.
No migration is needed: the schema remains at V35.

## Authentication and scope

Use the existing authenticated session (`JSESSIONID`) established through
`POST /api/auth/login`. All POST requests require the session's current
`X-CSRF-TOKEN`, obtained from `GET /api/auth/csrf` (refresh after login). Existing
explicit-origin CORS, credential handling, secure cookies and no-store headers
remain in force. Roles and enabled/archive state are reloaded from the database.

Astronauts may list, read and acknowledge only their own alerts. They cannot
resolve alerts or use the officer list. Officers may read, acknowledge and resolve
alerts for astronauts allowed by `AstronautService.getAstronautById`. The current
policy grants NASA officers access to all crew profiles, including archived ones;
this phase does not invent assignment/mission restrictions. Disabled accounts and
archived astronaut accounts lose session access. An officer may still review an
archived astronaut's existing alert history.

An astronaut requesting a missing or another astronaut's alert receives the same
404 response. The service also enforces these checks on direct Java calls;
authorities without the server's `AccountPrincipal` are insufficient.

## Endpoints

| Method | Path | Authorization | Behavior |
|---|---|---|---|
| GET | `/api/alerts/me` | ASTRONAUT | Paginated own alerts |
| GET | `/api/alerts` | NASA_OFFICER | Paginated authorized crew alerts |
| GET | `/api/alerts/{id}` | Owner or NASA_OFFICER | Alert detail and allowlisted evidence/history |
| POST | `/api/alerts/{id}/acknowledge` | Owner or NASA_OFFICER + CSRF | OPEN → ACKNOWLEDGED |
| POST | `/api/alerts/{id}/resolve` | NASA_OFFICER + CSRF | ACKNOWLEDGED → RESOLVED |

`{id}` is an alert UUID. There are no create, delete, reopen, severity-edit or
arbitrary-status endpoints.

## Pagination and filters

Both list endpoints accept the following optional query parameters, except that
`astronautId` is officer-only. Supplying it to `/me` returns 400.

| Parameter | Contract |
|---|---|
| `page` | Zero-based integer, default 0, range 0–10000 |
| `size` | Integer, default 20, range 1–100 |
| `astronautId` | Officer-only UUID; must identify an accessible profile |
| `severity` | Exact `INFO`, `WARNING`, or `CRITICAL` |
| `status` | Exact `OPEN`, `ACKNOWLEDGED`, or `RESOLVED` |
| `indicator` | Exact registered indicator code, e.g. `heart_rate` |
| `triggerType` | Exact `RULE`, `SELF_REPORT`, `ML`, or `MANUAL`; ML is historical retrieval only |
| `synthetic` | Exact lowercase `true` or `false`; omitted includes both |
| `from` | Inclusive `triggeredAt` bound, ISO-8601 instant |
| `to` | Exclusive `triggeredAt` bound, ISO-8601 instant |

Dates must be finite, within years 0001–9999, with at most microsecond precision.
When both bounds are present, `from` must be earlier than `to`. Filters combine
with AND. Indicator matching uses either the rule or attached observation evidence;
multiple matching observations do not duplicate an alert. Invalid filters return
400; an unknown officer-filter astronaut UUID returns 404.

Order is fixed: `triggeredAt DESC, id DESC`. There is no caller-controlled SQL sort.
Count and page reads share a repeatable-read snapshot. Offset pages are
deterministic for unchanged data; newly inserted alerts or lifecycle changes
between separate requests can shift subsequent pages. An out-of-range page
returns an empty `content`, retaining the current totals.

Example requests:

```http
GET /api/alerts/me?page=0&size=20&status=OPEN
GET /api/alerts?astronautId=00000000-0000-0000-0000-000000000002&severity=WARNING&synthetic=false
GET /api/alerts?indicator=heart_rate&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z
```

List response (synthetic illustration; IDs are placeholders):

```json
{
  "content": [{
    "id": "00000000-0000-0000-0000-000000000001",
    "astronautId": "00000000-0000-0000-0000-000000000002",
    "severity": "WARNING",
    "status": "OPEN",
    "triggerType": "MANUAL",
    "synthetic": true,
    "nonclinical": true,
    "reason": "Nonclinical demonstration review",
    "triggeredAt": "2026-01-01T00:00:00Z",
    "createdAt": "2026-01-01T00:00:01Z",
    "acknowledgedAt": null,
    "resolvedAt": null,
    "indicators": ["heart_rate"]
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1,
  "hasNext": false
}
```

Every summary includes `synthetic` and `nonclinical`, including summaries nested
in detail and transition responses. These flags must be preserved in any future UI.
Synthetic records retain their configured severity; severity does not override the
nonclinical designation. Legacy simulation provenance/evidence is conservatively
labeled without modifying historical records.

## Detail JSON

`GET /api/alerts/{id}` returns:

```json
{
  "alert": {
    "id": "00000000-0000-0000-0000-000000000001",
    "astronautId": "00000000-0000-0000-0000-000000000002",
    "severity": "WARNING",
    "status": "OPEN",
    "triggerType": "MANUAL",
    "synthetic": true,
    "nonclinical": true,
    "reason": "Nonclinical demonstration review",
    "triggeredAt": "2026-01-01T00:00:00Z",
    "createdAt": "2026-01-01T00:00:01Z",
    "acknowledgedAt": null,
    "resolvedAt": null,
    "indicators": ["heart_rate"]
  },
  "observations": [{
    "observationId": "00000000-0000-0000-0000-000000000003",
    "indicator": "heart_rate",
    "activityContext": "UNKNOWN",
    "comparisonScopeId": "00000000-0000-0000-0000-000000000004",
    "measuredAt": "2026-01-01T00:00:00Z",
    "sourceKind": "SIMULATION",
    "synthetic": true,
    "supersedesObservationId": null,
    "measurements": [{"metric": "value", "unit": "beats/min", "value": 10}]
  }],
  "rule": null,
  "baseline": null,
  "evaluation": null,
  "resolutionNote": null,
  "history": [
    {"kind": "CREATED", "occurredAt": "2026-01-01T00:00:01Z"},
    {"kind": "EVIDENCE_ADDED", "occurredAt": "2026-01-01T00:00:01Z"}
  ]
}
```

The numeric reading above is arbitrary synthetic example data, not a threshold.
Measurement objects contain `metric` (string), canonical `unit` (string) and
`value` (JSON number). Structured observations expose each available metric
separately: systolic/diastolic, grip_strength/muscle_mass, etc. Sleep duration is
reported in hours. Absent optional components are omitted, never synthesized.
Observations are ordered by measurement time then ID, descending. Measurements
are ordered by metric code. Evidence is never replaced by a later revision;
`supersedesObservationId` preserves the revision link when present.

The following optional reference objects have these exact fields:

| Object | Fields and types |
|---|---|
| `rule` | `id`: UUID string; `version`: integer; `indicator`, `metric`, `unit`, `designation`, `limitKind`: strings; `lowerBound`, `upperBound`: nullable numbers |
| `baseline` | `id`: UUID string; `version`: integer; `kind`: string; `referenceValue`: number; `unit`: string |
| `evaluation` | `id`, `observationId`: UUID strings; `evaluatedAt`: ISO-8601 instant; `lowerBound`, `upperBound`: nullable numbers |

`rule` identifies the exact immutable version attached to the alert. Its bounds
are the rule's stored bounds (signed offsets for BASELINE_DELTA). `evaluation`
provides the effective comparison bounds recorded by the engine. `baseline` is
returned only through the evaluation's reference to an approved personal baseline.
It must also belong to the alert's astronaut. A malformed cross-subject or
unapproved baseline link exposes neither the baseline nor its derived bounds.
Legacy/manual alerts may have no rule, baseline or evaluation; those objects are
null. `history` is in database event-sequence order and contains only event kind
and time. Account identities, actor logins, raw audit snapshots, unrestricted
provenance, simulation envelopes, credentials and internal evaluation JSON are
not serialized. Resolution notes and alert reasons are plain text for authorized
readers; clients must render them as text.

## Lifecycle requests and concurrency

Acknowledgment has no required request body:

```http
POST /api/alerts/{id}/acknowledge
X-CSRF-TOKEN: <current session token>
```

Resolution requires this JSON object:

```json
{"note":"Reviewed the alert and completed the operational follow-up."}
```

`note` is required, nonblank, and at most 2000 characters. The server derives the
actor UUID and timestamps from authentication and its clock; client-supplied
actor, timestamp or status fields cannot control the transition. Both POSTs return
200 with the same `Detail` shape as GET, reflecting the resulting state.

| Current state | Acknowledge | Resolve |
|---|---|---|
| OPEN | 200, append ACKNOWLEDGED event | 409, acknowledge first |
| ACKNOWLEDGED | 200, unchanged, no extra audit event | 200, append RESOLVED event |
| RESOLVED | 409, no reopening | 200 if the note exactly matches; otherwise 409 |

Writes reload/lock the account, check scope, and lock the alert. Concurrent
identical acknowledgments/resolutions return the original recorded timestamps and
add only one transition event. Competing resolution notes yield one success and
one 409. Existing database triggers validate transitions and append full internal
audit snapshots with the authenticated account UUID as actor. Alert evidence,
rule/baseline versions and evaluation outcomes are not edited or regenerated.
An alert whose observation/acknowledgment time is still in the future returns 409
rather than inventing a future lifecycle timestamp.

## Errors

Errors use the existing shape, for example:

```json
{"error":"Health alert not found."}
```

Status codes: 400 invalid input, 401 missing/expired/disabled session, 403 role or
CSRF denial, 404 unavailable alert/profile, and 409 invalid/conflicting transition.
No SQL error messages, stack traces or raw rejected values are returned.
