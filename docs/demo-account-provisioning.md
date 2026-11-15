# Login-only MVP and explicit demo provisioning

All accounts are pre-provisioned by trusted administrators. End users receive a
login name and password and use only login/logout; there is no public registration
or astronaut self-activation. The old activation schema/mappings are inactive and
remain unchanged to preserve V30. Frontend mock mode is unchanged; a later frontend
integration needs only a login form, session/CSRF handling, and `/api/auth/me`.

## Fictional local-development roster

| Login name | Role | Permanent crew code | Display name |
| --- | --- | --- | --- |
| `maya.demo` | ASTRONAUT | `crew-01` | Maya Okafor |
| `tomas.demo` | ASTRONAUT | `crew-02` | Tomas Reyes |
| `lena.demo` | ASTRONAUT | `crew-03` | Lena Kowalski |
| `kwame.demo` | ASTRONAUT | `crew-04` | Kwame Asante |
| `officer.demo` | NASA_OFFICER | None | Separate officer account |

These are public fictional identifiers, not credentials. No password is provided
by the source code or migration. The operator chooses a separate initial password
for each newly created account through hidden terminal input and confirmation.
Passwords must be nonblank, at least 15 Unicode code points, and at most 72 UTF-8
bytes. The existing application's BCrypt encoder (cost 12) hashes them before SQL
insertion. Password buffers are cleared after use; passwords/hashes are never
printed or passed through command-line arguments. Privately deliver each initial
password to the intended demo user. No password-change/reset UI is implemented.

## Provisioning guarantees

`DemoProvisioningCommand` is a separate `main`, not a Spring Boot startup runner,
component, scheduled task, or HTTP endpoint. It loads only `AuthBeans` to reuse
the PasswordEncoder and uses JDBC for an explicit transaction. It never launches
the backend, creates schemas, or applies migrations. Flyway is used only for
read-only migration inspection and validation.

The command requires all of:

- The exact `--provision-fictional-demo` argument.
- `ASTROHEALTH_ENV=development`.
- Explicit `DB_URL`, `DB_USER`, and `DB_PASSWORD` environment variables.
- A loopback PostgreSQL JDBC URL (`localhost`, `127.0.0.1`, or `[::1]`) without
  URL credentials/query options. This is an accident-prevention guard, not proof
  that a local database contains demo data; the operator must verify its identity.
- An interactive Java console supporting hidden password entry; piped input and
  IDE consoles without `System.console()` are refused.
- A verified migration history containing successful V30, already applied
  separately. V30 and V31 are supported; later applied migrations must be known
  to the bundled migration files and validate successfully. Missing, failed,
  incomplete, or checksum-invalid history is refused. Migrations above the current
  applied version may remain pending (for example, V31 on a V30 database).

All four profiles and five accounts are handled atomically. A transaction-scoped
PostgreSQL advisory lock serializes concurrent invocations of this tool. Operator
input has a five-minute transaction budget; cancellation, invalid input, identity
conflicts, or database errors roll back the batch. Only created/unchanged counts
are printed on success; raw SQL failures and stack traces are not printed.

Existing crew codes are reused only if their display names match the fictional
roster and they are not archived. Existing UUIDs, crew codes, and historical data
are never changed. A matching account is skipped without prompting, resetting its
password, enabling it, changing its role, or relinking its profile. Mismatched
logins/profile links/roles are rejected. Database uniqueness remains a final
defense against other writers. No records are deleted and no invitation rows are
created or consumed.

## Later: apply V30 safely (separate approval required)

These are instructions for a future approved operation. They have **not** been
executed against `astrohealth`. Do not start Spring Boot against that database
before approval: normal backend startup runs Flyway automatically.

1. Obtain explicit approval to apply V30 to the intended development database.
   Stop development backend instances/writers. Confirm the target is the local
   PostgreSQL 17 development database and that its latest successful migration
   is V29. Keep all V1–V30 files unchanged.
2. Take a recoverable backup, for example using the PostgreSQL 17 `pg_dump` tool
   from a terminal. It prompts privately for the database password. Pick a private
   backup directory outside the repository:

   ```powershell
   pg_dump -h localhost -p 5433 -U astrohealth_app -d astrohealth -W -Fc -f 'C:\private-backups\astrohealth-before-v30.dump'
   ```

3. Use an installed PostgreSQL-compatible Flyway CLI (preferably matching the
   backend's managed Flyway release). From `backend`, set `FLYWAY_URL`,
   `FLYWAY_USER`, and `FLYWAY_PASSWORD` from the approved database connection
   environment. Do not type passwords into shell commands or committed files:

   ```powershell
   $env:FLYWAY_URL = $env:DB_URL
   $env:FLYWAY_USER = $env:DB_USER
   $env:FLYWAY_PASSWORD = $env:DB_PASSWORD
   flyway '-locations=filesystem:src/main/resources/db/migration' '-target=30' '-cleanDisabled=true' info
   flyway '-locations=filesystem:src/main/resources/db/migration' '-target=30' '-cleanDisabled=true' validate
   ```

   Verify the displayed target, V29 current state, and only V30 pending. Stop if
   validation fails or the target/state differs. Do not use clean, repair,
   baseline, drop, or reset to bypass a mismatch.
4. Only after those checks and approval, apply and verify:

   ```powershell
   flyway '-locations=filesystem:src/main/resources/db/migration' '-target=30' '-cleanDisabled=true' migrate
   flyway '-locations=filesystem:src/main/resources/db/migration' '-target=30' '-cleanDisabled=true' validate
   flyway '-locations=filesystem:src/main/resources/db/migration' '-target=30' '-cleanDisabled=true' info
   ```

   Confirm V30 succeeded and the new tables exist. Never edit the schema-history
   table manually. Clear the temporary `FLYWAY_*` credential environment variables
   when finished. See the official [Flyway CLI options](https://documentation.red-gate.com/fd/command-line-parameters-277578836.html)
   and [password environment setting](https://documentation.red-gate.com/flyway/reference/configuration/environments-namespace/environment-password-setting).

## Later: run the explicit provisioning command

After V30 is approved/applied and verified, from `backend` in a real terminal:

```powershell
# JAVA_HOME must point to JDK 21; compilation still targets Java 17.
.\mvnw.cmd -B clean compile dependency:build-classpath '-DincludeScope=runtime' '-Dmdep.outputFile=target/provisioning-classpath.txt'
if ($LASTEXITCODE -ne 0) { throw 'Build failed; do not provision.' }
$runtimeClasspath = 'target/classes;' + (Get-Content target/provisioning-classpath.txt -Raw).Trim()
$env:ASTROHEALTH_ENV = 'development'
# Set DB_URL/DB_USER/DB_PASSWORD privately for the approved local development database.
# Expected URL for the existing Compose setup: jdbc:postgresql://localhost:5433/astrohealth
& "$env:JAVA_HOME\bin\java.exe" -cp $runtimeClasspath com.augustine.nasa_space_app_backend.provisioning.DemoProvisioningCommand --provision-fictional-demo
if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed; inspect the fixed safe message.' }
Remove-Item Env:ASTROHEALTH_ENV
```

This Java command runs directly in the terminal so `Console.readPassword()` can
hide input. Do not run it via a Maven exec task or pipe passwords into it. The
operator is prompted only for missing accounts; reruns leave existing credentials
untouched. The command cannot migrate a V29 database. Keep production provisioning
outside this local fictional-data tool and under trusted administrative control.

After provisioning, start the backend normally only against the approved and
verified V30-or-later database. Keep secure cookies enabled for HTTPS; explicit local HTTP development
requires `SESSION_COOKIE_SECURE=false`. Login uses `/api/auth/csrf`,
`POST /api/auth/login`, `/api/auth/me`, and `POST /api/auth/logout` as described in
[authentication-phase2.md](authentication-phase2.md). The login screen asks only
for login name and password. Do not send a role, profile ID, or activation credential.

## Safe tests

`.\mvnw.cmd -B clean test` compiles and tests against disposable PostgreSQL 17
Testcontainers only. Maven clean removes generated build files, not databases.
The tests cover login-only endpoint access, retained session/cookie/CSRF/CORS
behavior, role/ownership/archive restrictions, explicit provisioning guards,
BCrypt hashes, fixed role assignments, idempotency, conflicts, password buffer
clearing, and transaction rollback. Old activation mapping/constraint tests remain
to verify compatibility of the preserved inactive schema.
