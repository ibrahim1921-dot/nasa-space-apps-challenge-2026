# Authentication persistence: Phase 1

> Historical design note: the final MVP is login-only with trusted account
> provisioning. Activation schema/mappings remain inactive for migration
> compatibility; there is no public activation or registration. See
> [current authentication](authentication-phase2.md) and
> [demo provisioning](demo-account-provisioning.md). Invitation-related plans
> below are superseded and are not instructions for the current application.

Phase 1 adds persistence only. There is no login, activation endpoint, session
security configuration, authorization service, or provisioning runner yet.
The existence of these tables does not make the running application authenticated.

## Schema and identity

`V30__create_accounts_and_astronaut_activations.sql` follows the unchanged V1–V29.
Flyway owns all DDL; Hibernate remains configured to `validate`.

An `ASTRONAUT` account must reference exactly one existing astronaut UUID.
The unique `accounts.astronaut_id` constraint permits at most one account per
profile. A `NASA_OFFICER` account must have no astronaut link. Roles are stored as
strings and are mutually exclusive. There is no dual-role/interface-switching model.

`astronauts.id` remains the internal UUID. `astronauts.crew_code` remains the stable
external crew code. Future DTOs must label these as `astronautId` and `crewCode`;
they must not silently assign either meaning to the other's JSON field.

Accounts have a unique lowercase ASCII login name (3–64 characters, starting with
a letter/digit, followed by letters/digits/periods/underscores/hyphens). Future
services must normalize names consistently before lookup/provisioning. Display
names and crew codes are not proof of account ownership.

`password_hash` accepts standard 60-character BCrypt encodings, without a
`{bcrypt}` prefix. Phase 2 must use Spring Security's `BCryptPasswordEncoder` before
constructing an account. The database format constraint cannot prove that a value
was produced by a password encoder. No password or invitation secret is seeded.

Activation records bind a provisioned login name to one astronaut UUID. The
credential digest is lowercase hex SHA-256 of a cryptographically random,
high-entropy secret, not a password hash and never a name/crew-code digest.
Generation, digest comparison, expiry enforcement, and credential delivery belong
to Phase 2. Issuer UUID is nullable solely for trusted operator provisioning;
when supplied it references an account. Phase 2 must verify the issuer is an
officer; the foreign key does not authorize the caller.

Both entity types use database-generated UUIDs and creation timestamps, omitted
from INSERTs and retrieved by Hibernate. Foreign keys are represented by UUID
properties rather than navigable JPA relationships. Database foreign keys still
enforce integrity and restrict deletion. No cascades or changes to historical
medical/mission records are introduced.

## Activation transactions required in Phase 2

- Lock the astronaut profile and invitation in a consistent order. Activation
  repository locking methods require a caller-managed write transaction.
- Check the current profile/archive state, credential digest, expiry, terminal
  state, attempt count, and absence of an existing account before redemption.
- Create the account and mark the invitation consumed atomically. Uniqueness of
  account login/profile links is the final defense against concurrent claims.
- Failed attempts must commit even when the client receives a generic failure.
  Five failures exhaust an invitation. A database trigger prevents decreasing the
  counter or resetting/changing a consumed/revoked timestamp. A check constraint
  rejects consumption at the failure limit. Application checks are still required
  before redemption, including current time and credential verification.
- Reissuing explicitly revokes the previous outstanding invitation, including an
  expired or exhausted one. Partial unique indexes reserve both the profile and
  login while an invitation is unconsumed/unrevoked. Expiry alone does not release
  these reservations. Time-dependent partial index predicates are not used.
- Login-name uniqueness spans each table independently, not both tables together;
  provisioning must check accounts as well as outstanding invitations, and handle
  account unique-constraint conflicts safely during redemption.
- `@Version` protects against stale JPA updates. It is not a substitute for the
  redemption transaction or checks, and raw SQL can bypass optimistic locking.

Never return these entities from controllers or log their hashes. Constraint
exceptions can contain failing row data: future exception handlers must not log
raw database exceptions or return their details. Avoid SQL parameter logging.

## Frontend integration (future phase)

Frontend files and mock mode are unchanged. The real-backend flow will need:

- Activation/password login forms and identity loaded from `/api/auth/me`.
- HTTP-only session cookies, `credentials: 'include'`, and CSRF token headers.
- Roles from the server (`ASTRONAUT`, `NASA_OFFICER`), separate from mission labels.
- Server logout and no one-click impersonation in real-backend mode.
- Explicit adapters for existing `crew-01` values to the `crewCode` field.
- Pause synchronization on `401`; never treat `401`/`403` as offline success or
  restore private cached data after denied access. Agree on browser storage
  isolation/clearing for private records before real health data is integrated.

Session authentication, BCrypt encoding, CORS/CSRF, login attempt restrictions,
and request-time checks denying archived astronauts (including existing sessions)
remain mandatory Phase 2 work. Officers will not have personal astronaut features.
No public officer registration or role-assignment endpoint is planned.

## Safe verification and deployment

Run with JDK 21 and Docker available, from `backend`:

```powershell
.\mvnw.cmd -B test
```

Tests start a disposable `postgres:17` container on a dynamically assigned port,
override both datasource and Flyway connection properties, apply V1–V30, and
validate the JPA schema. The original context-load test uses the same isolated
configuration. Docker failure fails the tests; it never falls back to `DB_URL`.
Testcontainers removes its test resources at test-JVM exit. There is no reference
to the development database volume, no Flyway clean, and no database reset.

An additional test schema models the V29-to-V30 upgrade with a pre-existing
astronaut. JDBC constraint tests roll back their fixtures; expected constraint
failure details are not printed because PostgreSQL can include hashes in them.

No migration has been authorized for the existing `astrohealth` database. Normal
application startup still runs Flyway: do not start it against that database with
V30 present until migration approval is granted. This phase adds no runtime
provisioning and no automatic seed configuration.
