# Astronaut profiles: Phase 3

This phase adds profile reads, a safe active roster, and officer-only
archive/reactivate operations. Login-only authentication, account provisioning,
session cookies, CSRF, CORS, and all V1-V30 migrations are unchanged. No health
ingestion, health-data endpoints, mission services, deletion, or profile creation
API is implemented.

## Endpoints and authorization

All successful requests return `200` JSON. All routes require authentication;
POSTs additionally require the current session's CSRF token.

| Method | Path | ASTRONAUT | NASA_OFFICER |
| --- | --- | --- | --- |
| GET | `/api/crew` | Safe active roster | Safe active roster |
| GET | `/api/crew/me` | Own profile from session account | 403; officers have no astronaut link |
| GET | `/api/crew/{id}` | Own UUID only | Any active or archived profile |
| GET | `/api/crew/by-code/{crewCode}` | Own exact crew code only | Any active or archived profile |
| POST | `/api/crew/{id}/archive` | 403 | Archive, or return unchanged archived profile |
| POST | `/api/crew/{id}/reactivate` | 403 | Reactivate, or return unchanged active profile |

`{id}` always means an internal UUID. `crewCode` is the permanent external code
and is matched exactly; it is not lowercased like a login name. There is no
`includeArchived` roster parameter in this phase. Officers can retrieve archived
profiles by their known UUID or crew code. POSTs require no body and do not accept
identity/role/profile updates.

Roster response (sorted by crew code; an empty roster is `[]`):

```json
[
  {
    "astronautId": "00000000-0000-0000-0000-000000000001",
    "crewCode": "crew-01",
    "displayName": "Maya Okafor"
  }
]
```

Detail and archive/reactivate response:

```json
{
  "astronautId": "00000000-0000-0000-0000-000000000001",
  "crewCode": "crew-01",
  "displayName": "Maya Okafor",
  "createdAt": "2026-11-14T08:00:00Z",
  "archivedAt": null
}
```

The example UUID is illustrative, not seeded. DTOs expose no account IDs, login
names, credentials, application roles, mission relationships, or health records.
The roster omits archive/creation timestamps as well. Spring Security retains
non-cacheable response headers for these authenticated responses.

## Service rules and transactions

`AstronautService` implements all six requested operations. Read operations use
read-only transactions. Archive/reactivate use write transactions and the existing
repository's pessimistic row lock to serialize changes to a profile.

Every public service operation obtains the account UUID from the authenticated
`AccountPrincipal`, then uses `AuthService` to reload its current enabled state,
role, and linked astronaut/archive state. This also applies to direct service
calls without servlet filters. Cached authorities or client-supplied UUIDs are not
authorization. Astronaut lookup authorization is checked before querying another
profile, so requests for another or unknown identity receive the same `403`.
`getMyProfile()` has no profile/account ID argument. Officers cannot call it
because their accounts intentionally have no astronaut link.

Archiving sets `archived_at` only when it is null. The timestamp is truncated to
PostgreSQL's microsecond precision so the initial response equals subsequent
responses. Repeating archive preserves the original archive timestamp. Repeating
reactivation leaves it null. Neither operation changes UUID, crew code, creation
timestamp, account credentials/role/enabled state, or historical rows. There is no
physical delete service operation or HTTP route.

An archived astronaut is denied login and protected requests through the existing
authentication filter and the service checks. Its next authenticated request
invalidates that session. Reactivation allows login again; it does not restore a
session that has already been invalidated. Requests already in flight when an
archive commits cannot be retroactively canceled. The profile-row lock coordinates
profile mutations; future clinical writes need their own transaction/authorization
policy and are not included here.

## Errors

- `401`: no valid session, disabled account, or archived astronaut session.
- `403`: another astronaut's profile, officer-only mutation, or officer `/me`.
- `403`: missing/invalid CSRF token on a POST (checked before authentication).
- `404`, `{ "error": "Astronaut profile not found." }`: authorized lookup or
  mutation targets a missing profile.
- `400`, `{ "error": "Invalid astronaut identifier." }`: malformed UUID on an
  authorized route. Supplying `crew-01` in the UUID route is not silently converted.

Existing safe authentication/persistence error handling remains in place. Raw JPA
entities or SQL exception details are never returned.

## Frontend integration still required

No frontend files or the shared v0.1 API contract were changed. Its provisional
roster `{id, name, role}` and mock `GET /api/crew?crew=...` selected-person payload
do not match these explicit profile DTOs. A frontend adapter must map
`crewCode` to the legacy external crew identifier and `displayName` to its display
label, while preserving `astronautId` separately for UUID routes. Use
`/api/crew/me` for the astronaut's header/profile rather than treating a browser
crew picker as identity. An officer UI should use its account identity and roster,
not expect an officer-linked personal astronaut profile.

Mission-role labels (such as Flight engineer) are not application authorization
roles and are not supplied by this profile API. No mission role is invented.
The current frontend still needs real login/session/CSRF integration, credentialed
fetches, and the agreed cache/outbox privacy behavior. A team-reviewed contract
update/adapter is required before replacing mocks. Health/summary/readings and
mission endpoints remain outside this phase and denied by default.

## Safe verification

Run from `backend` with JDK 21 and Docker available:

```powershell
.\mvnw.cmd -B test
```

All persistence tests inject PostgreSQL 17 Testcontainers URLs for datasource and
Flyway. Tests fail rather than fall back to development. Direct service tests
cover role spoofing, own-profile checks, missing targets, enabled/archive status,
idempotency, concurrent archiving, and unchanged historical mission/check-in/
observation/measurement rows. Those fictional SQL fixtures exist only in tests;
they are not health-ingestion code. HTTP tests exercise actual login sessions,
role/ownership permissions, safe DTOs, CSRF, errors, no delete/update route, and
archive denial/reactivation. Existing authentication/provisioning tests remain.

No migration was applied to development. The existing V30 approval/provisioning
steps in `demo-account-provisioning.md` still apply before running this backend
against the development database.
