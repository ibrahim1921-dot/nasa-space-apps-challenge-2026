# Authentication and security: Phase 2

The final MVP is login-only. Trusted administrators pre-provision all accounts;
there is no public registration or astronaut self-activation. Phase 3 now adds
the profile service/controller and officer-only archive/reactivate routes; see
[astronaut-api-phase3.md](astronaut-api-phase3.md). There is no health API or
provisioning runner. The separate development command is documented in
[demo-account-provisioning.md](demo-account-provisioning.md). All other paths are
denied by default until an explicit authorization policy is added.

## Endpoints

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/auth/csrf` | Public; `{ "headerName": "X-CSRF-TOKEN", "token": "..." }` |
| POST | `/api/auth/login` | `{ "loginName": "...", "password": "..." }`; `200`, safe identity and session cookie |
| POST | `/api/auth/logout` | No body; `204`, invalidates current session and expires its cookie |
| GET | `/api/auth/me` | Authenticated; safe identity derived solely from the session account UUID |

Login and `/me` return:

```json
{
  "accountId": "00000000-0000-0000-0000-000000000001",
  "loginName": "maya.demo",
  "role": "ASTRONAUT",
  "profile": {
    "astronautId": "00000000-0000-0000-0000-000000000002",
    "crewCode": "crew-01",
    "displayName": "Maya Okafor"
  }
}
```

These UUIDs are illustrative, not seeded data. Officers have `role: NASA_OFFICER`
and `profile: null`. Internal UUIDs and permanent external crew codes have distinct
JSON fields. Client-supplied profile/account IDs and roles cannot select the
identity returned by `/me`. Extra JSON properties are rejected, including a role
added to login input. Request DTO `toString()` methods redact credentials.

## Session and browser flow

1. Fetch `/api/auth/csrf` with `credentials: 'include'`; retain the returned token
   in memory and send it in the named header on every POST, including login and
   logout. CSRF protection applies even before login.
2. Enter the login name and initial password privately supplied by the trusted
   administrator. No activation code, registration form, role, or profile choice is needed.
3. Login verifies BCrypt, enabled state, and current astronaut archive state.
   Unknown logins still perform a dummy BCrypt verification. Unknown, disabled,
   archived, and incorrect-password failures have the same `401` message.
4. Successful login rotates an existing session ID, clears its prior CSRF token,
   and explicitly saves a Spring Security context in the server session. The
   principal contains only an account UUID, and authentication credentials are null.
5. Fetch a fresh CSRF token after login. Use `/me` for trusted identity/role.
6. POST logout with the fresh CSRF token. Standard Spring Security logout handlers
   clear CSRF/security state, invalidate the session, and expire `JSESSIONID`.
   Old cookies no longer authenticate. Fetch a new CSRF token before another login.

Every authenticated request reloads the enabled account, role, linked astronaut,
and archive state from PostgreSQL before authorization. Disabling an account or
archiving an astronaut denies its next request and invalidates that session.
Database-check failures deny access with `503`; cached session authorities are
never sufficient. Reactivation does not repair an already invalidated session;
a fresh login is required. Requests already in flight when an archive commits
cannot be retroactively canceled. Future astronaut write services must coordinate
their transaction checks/locks with archiving.

Roles remain distinct. Method security is enabled for future explicit
`@PreAuthorize` policies; officers do not automatically inherit astronaut-only
permissions. No public API creates officers or assigns roles. Login/logout affect
the current browser session, not all devices. Sessions use in-memory servlet
storage and expire after 30 minutes of inactivity; server restart signs users out.

## Passwords and inactive activation schema

New passwords must contain at least 15 Unicode code points and at most 72 UTF-8
bytes. Login accepts existing nonblank passwords within the same BCrypt byte
limit. Oversized values are rejected, never truncated. BCrypt uses cost 12 and
stores standard encodings compatible with V30. Login names accept ASCII letters,
digits, periods, underscores, and hyphens, are 3–64 characters, and normalize to
lowercase for lookup.

V30's `astronaut_activations` table, constraints, indexes, trigger, JPA entity, and
repository remain solely for non-destructive schema/migration compatibility. They
are inactive: no application workflow creates, delivers, or redeems invitations.
`ActivationService`, `ActivationRequest`, and the controller mapping were removed.
There is no feature flag that enables public activation. Registration and
activation requests are denied for anonymous users and for both account roles.
The persistence tests for the old table only verify retained schema/mapping integrity.

## Attempt restrictions and failure handling

Fixed windows last 15 minutes, including successful requests in the budgets:

- Login: 30 requests per source IP and 5 per normalized login name.
- Invalid JSON/input still counts toward the IP limit after passing CSRF.
- `429` includes `Retry-After: 900` (a conservative upper bound).

Counters share a maximum of 10,000 keys, expire automatically on subsequent
requests, and fail closed at capacity rather than evicting active restrictions.
Updates are synchronized. The in-memory limits reset on restart and are intended
for one server instance. Shared rate limiting is required before running multiple
instances. Login-name limits permit temporary denial of service against a known
identity; this MVP uses short windows rather than permanent account lockout.

Source IP comes from the servlet connection, not client-controlled
`X-Forwarded-For`. A reverse proxy may make all requests share one IP budget.
Configure trusted proxy handling at deployment before relying on client IPs;
never blindly trust forwarded headers from the public internet.

Validation returns generic `400` errors without rejected values. Authentication
responses are non-cacheable. No application code logs passwords, hashes,
invitation secrets, or session/CSRF tokens. SQL/bind/extract/error logging is
disabled because database errors can contain full rows. Do not enable request
body or parameter logging on authentication routes in proxies/APM/debug tooling.

## Configuration and integration

- `FRONTEND_ORIGINS`: comma-separated explicit HTTP(S) origins; defaults to
  `http://localhost:3000`. Wildcards, user info, paths, and query/fragment parts
  are rejected. Credentialed CORS allows GET/POST/OPTIONS and the content-type
  and CSRF headers.
- Session cookies default to `Secure`, `HttpOnly`, `SameSite=Lax`, with cookie-only
  tracking. Deploy over HTTPS with frontend/backend under the same site, preferably
  one public origin via a reverse proxy. Unrelated cross-site deployments need a
  separate reviewed cookie/deployment policy.
- For explicit local HTTP development only, set `SESSION_COOKIE_SECURE=false`.
  Keep it true for deployed environments. This option does not start provisioning.
- Frontend mock mode is unchanged. Real integration still needs login-only
  forms, credentialed fetch/CSRF flow, server logout, `/me` identity, and cache/outbox
  privacy changes described in `authentication-phase1.md`. Never treat `401` or
  `403` as an offline success.

## Verification and scope boundary

From `backend`, with JDK 21 and Docker available, run `.\mvnw.cmd -B test`.
All persistence tests inject isolated PostgreSQL 17 Testcontainers connection
details for both datasource and Flyway. Tests fail instead of falling back to
development settings. A random-port HTTP test checks actual servlet cookies,
pre-provisioned login, session ID rotation, CSRF refresh, identity persistence, and logout; it manually
transmits secure cookies over loopback HTTP solely to verify the production
cookie configuration without test TLS. MockMvc request/response printing is
disabled to keep test secrets out of failure logs.

No migrations were added or changed, and no development database was accessed.
The existing development database still needs separately approved V30 deployment
before this code can run there. Normal application startup runs Flyway: do not
start it against development until that approval. The development provisioning
command never invokes Flyway and refuses to provision a schema whose latest
successful version is not V30. No runner/automatic seed exists. Production account
provisioning remains a trusted administrative responsibility; the fictional demo
tool is restricted to explicit local-development use.
