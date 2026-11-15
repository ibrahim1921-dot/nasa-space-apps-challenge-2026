# Explicit Simulation Lab delivery — Phase 4C.5

The separate Lab browser can submit original Python exports to Spring Boot. Delivery
is disabled by default, never starts with the simulator, and never runs on a timer,
login, capture verification or reload. Each delivery requires an explicit officer
approval and button click. Python still has no Spring credentials, HTTP sender,
database connection, threshold evaluation or trained inference.

This phase changes only `simulation/`. No backend configuration, account, scope,
capture, migration or development database was accessed/provisioned during implementation.
Spring responses used by automated delivery tests are mocked, not live ingestion.

## Existing prerequisites and current compatibility blocker

Actual development prerequisites have not been confirmed. Before live use, separately
approve/verify the database migration state, existing fictional astronauts/officer,
ACTIVE capture registration, and controlled comparison scope provisioning:

- [Capture registration](../backend/docs/simulation-capture-registration.md)
- [Complete observation ingestion](../backend/docs/synthetic-observation-ingestion.md)
- [Explicit scope provisioning and V32 audit](../backend/docs/demo-simulation-scope-provisioning.md)

The existing backend must already have its development/demo environment and
`SIMULATION_CAPTURE_REGISTRATION_ENABLED=true`. This UI neither sets those flags nor
creates missing prerequisites. All profiles emitted for the capture's run must match
its approved mappings; a same-run unapproved source stops the page before submission.

**Default CORS/cookie settings block the Lab's delivery path.** Spring's default allowed
origin is `http://localhost:3000`; the Lab runs on `http://127.0.0.1:5173` or preview 4173.
A future approved backend deployment configuration must explicitly allow the exact Lab
origin with credentials. Preserve any other approved origins; never use a wildcard,
disable CSRF, rewrite Origin, add a permissive backend proxy, or use `no-cors`.

The browser must reach Spring on a separate port using the **same hostname and scheme**
as the Lab. `localhost` and `127.0.0.1` are different cookie sites. The client refuses
those mismatches and refuses both default and configured Python proxy ports as backend
targets before sending any credentials. Spring's cookies are
HttpOnly, SameSite=Lax and Secure by default. Use compatible HTTPS origins to retain
Secure cookies, or separately approve the existing backend's strictly local HTTP
development setting `SESSION_COOKIE_SECURE=false`; this phase changes neither.
There is no assumption that an existing main-frontend login cookie works on another host.

No backend source change is required for one explicitly allowed Lab origin under a
compatible deployment configuration. That configuration, actual prerequisites, and
real end-to-end authorization still need review/verification. Global delivery leases
across different UI origins/devices and historical receipt-recovery APIs, if required,
would need a later backend enhancement; this phase does not invent client credentials
or weaken security to implement them.

## Explicit Lab opt-in and officer action

From `simulation/ui`, only after the prerequisites and target have been reviewed:

```powershell
$env:VITE_SIMULATION_DELIVERY_ENABLED = 'true'
$env:VITE_SPRING_BOOT_ORIGIN = 'http://127.0.0.1:8080' # illustrative reviewed loopback origin
npm run dev
```

These are Vite build/start inputs. Missing or non-`true` delivery opt-in produces an
inert disabled panel and no backend requests. Restart Vite/rebuild when changing them.
Only an origin is accepted: no URL credentials, paths, query options or fragments.
Preview needs its own exact CORS allowance and uses the values compiled at build time.
Do not put credentials in Vite variables: they are public browser configuration.

1. In the separate **Deliver synthetic observations** panel, either use an existing
   compatible officer browser session or sign in directly to Spring Boot. The panel
   first obtains Spring's CSRF contract, posts login with that token, then fetches a
   fresh token after session rotation. It verifies `/api/auth/me` reports NASA_OFFICER.
   The password field is cleared immediately and never enters storage or Python.
2. Enter an **existing capture UUID** and click **Verify session and capture**. The
   backend must return ACTIVE, owned by this officer, with approved existing mappings.
   The panel displays the actual workspace/run, source codes, destination codes/UUIDs.
   Python state is consulted only for workspace/run/source existence; it is never used
   as measurement content. A zero-length frozen export also verifies the workspace.
3. Review that binding and check the explicit delivery authorization box. Click
   **Deliver one frozen snapshot**. Chart selection, engine Start/Reset, and historical
   chart views never retarget this binding or trigger delivery. Retained past runs may
   be delivered to their own capture, but unknown runs are refused even on empty export.
4. Review created/duplicate/error counts and the last confirmed checkpoint. Further
   records require another button click. **Stop delivery** aborts the current worker;
   an in-flight POST can still have committed and is retained for unchanged retry.

**End browser session** uses the existing CSRF-protected backend logout endpoint.
It clears only in-memory authorization/binding, preserving saved delivery checkpoints.
Neither this panel nor Python registers captures or provisions profiles/accounts/scopes.

## Credential isolation

All Spring calls go directly from the browser to the reviewed Spring origin using
`credentials: include`, CORS, and X-CSRF-TOKEN on POST. There is no Basic/Bearer API key,
long-lived token, password-bearing URL, backend proxy, or session secret in Python.

Cookies ignore port numbers. A Spring cookie for 127.0.0.1 could otherwise accompany a
same-host request to the Lab/Python proxy. Every Lab engine/export fetch now explicitly
uses `credentials: omit`; the existing Vite Python proxy additionally strips Cookie,
Authorization, Proxy-Authorization and X-CSRF-TOKEN and drops Python Set-Cookie replies.
That applies to dev and preview. It is not a CORS/auth workaround: the proxy still
targets only Python, while Spring requests must pass Spring's real security controls.

The tests verify that an HttpOnly mock Spring session cookie exists while browser
requests to Python omit cookies. Real Spring credentials are never used by tests.

## Frozen pages, batching and confirmed checkpoints

Only `GET /api/v1/observations` supplies measurements. The client consumes original
envelopes, including subtype values, timestamps, scope descriptors, metrics, baseline
snapshots/deviations, provenance and simulation metadata. It does not compute or
convert measurements, copy chart points, infer destination UUIDs or alter source IDs.

The first request uses the capture's workspace, its saved global append position, and
limit 100. Python freezes `through`. Every next_url must be the same endpoint/workspace,
advance exactly to last_sequence, retain its limit, and keep that frozen through value.
The client follows it unchanged until the snapshot ends, then stores checkpoint_url
(which omits through) for the next explicit action. It never follows external URLs.

Each page is fully checked before posting. Other runs are explicitly excluded and
counted, never redirected to this capture. Same-run source UUID/code pairs must match
the immutable approved mapping. A mixed-run export may therefore create sequence gaps,
which the backend supports.

Complete records split at 100 items **and actual UTF-8 body size of 1 MiB**. No record
is truncated or replaced by a projection. Raw envelopes above 64 KiB stop delivery;
the browser also bounds export reading to 8 MiB and JSON nesting to 32 levels.

A syntax walk retains each original envelope's JSON substring rather than converting
its numbers through JavaScript Number and JSON.stringify. This preserves 64-bit integer
seeds and exact original decimals. Duplicate JSON keys/trailing malformed input are
rejected. The backend remains responsible for authoritative semantic validation and
canonical payload hashes.

Before any POST, the original frozen page, continuation URLs and batch index are saved
as a bounded local outbox. After each POST, the client requires a successful readable
response matching the capture, every sequence/source ID, valid observation UUIDs,
duplicate flags and counts. **Only then** does it persist a higher confirmed sequence
and confirmed export URL. Network failures, malformed acknowledgements and rejected
requests cannot advance that confirmed checkpoint.

The displayed **export scan cursor** is separate: it can move past explicitly excluded
other-run records without claiming they were submitted. The **confirmed checkpoint**
advances only on matched backend receipts. Empty/other-run-only pages create no backend
request and cannot manufacture a delivery acknowledgement.

Counts are locally acknowledged created/duplicate records, not a database-wide tally.
If a create committed but its reply was lost, its recovered reply is correctly counted
as a receipt duplicate. Clearing local data does not delete or undo server observations.

## Retry, reload, exclusivity and restart behavior

Saved state is scoped to browser origin + backend origin + capture UUID, and contains
the officer ID, immutable run/workspace/mapping binding, confirmed position, scan URL,
counts and pending original page. It contains no passwords, CSRF tokens or session
secrets. Records are synthetic, but browser storage still needs to be protected from
untrusted same-origin scripts; it is a convenience checkpoint, not signed server evidence.

- Reload never resumes delivery automatically. Verify the same capture/session, review
  the binding and explicitly authorize **Retry pending snapshot unchanged**.
- A partial split page resumes at its first unconfirmed batch. Already acknowledged
  batches are not resent. Ambiguous batches are resent with unchanged original content,
  sequence and IDs; backend durable receipts decide duplicate versus conflict.
- Storage failure stops before POST if the outbox cannot be saved. If storage fails
  after a confirmed server response, the previous durable outbox is retained and retry
  is receipt-safe. There is no silent volatile-memory fallback.
- Native Web Locks serialize checkpoint initialization and the entire worker for one
  capture across tabs of the **same Lab origin**. Missing Web Locks fails closed.
  A stale tab reloads the latest durable checkpoint after obtaining the lock. Use one
  canonical Lab origin; different ports/hostnames/devices do not share Web Locks or
  localStorage. Backend receipt/capture locks remain the final idempotency safeguard.
- Engine Reset retains old runs and does not change the workspace. Existing captures
  remain bound to their own retained run; new runs need separately registered captures.
- Python process restart changes workspace_id and loses unexported history. The client
  stops even if seed-based run/source IDs repeat. It never silently resets/reuses the
  old checkpoint against the new workspace. Pending originals remain locally saved,
  but automatic replay after workspace loss or capture closure is refused; any recovery
  requires separate review of the original capture and durable receipts.
- Local checkpoints survive reload/browser reopening only while that origin's storage
  is retained. Private sessions, cleared storage or a different device/origin do not
  recover them. Browser outboxes are not a durable export archive; externally preserved
  exports and backend receipts have different responsibilities.

401/403 stop for session/role/CSRF/CORS/feature review. 409 stops for capture, payload,
archive or radiation-order review; do not modify the pending payload to bypass it.
422 stops with instructions to use the controlled administrative scope workflow.
Other malformed responses, byte limits or unavailable services also stop. There are no
automatic retries, registration, scope creation, fallback credentials or capture redirects.

## Deterministic verification without a live backend

```powershell
# Repository root: pure engine + test-owned loopback API servers, no Spring/database.
python -B -m unittest discover -s simulation/tests -v

cd simulation/ui
npm test
npm run build

# Test-owned Python workspace on 18765; refuses existing servers rather than resetting them.
$env:LAB_E2E_MANAGED_PYTHON = 'true'
# On this workstation, if needed:
$env:LAB_PYTHON_EXECUTABLE = "$env:LOCALAPPDATA/Programs/Python/Python314/python.exe"
$env:LAB_E2E_DELIVERY = 'false'
npm run test:e2e   # Existing real-engine Lab controls/charts test, delivery disabled.
$env:LAB_E2E_DELIVERY = 'true'
npm run test:e2e   # Delivery UI contract tests; Spring origin 18080 is fully intercepted/mocked.
```

Both browser modes own and stop their Vite/Python children. They never start Spring,
PostgreSQL or provisioning. Mocked delivery uses the actual complete export example,
including its original envelope fields. Node tests cover frozen pagination, exact retry
payloads, partial-batch recovery, count/UTF-8 limits, conflicts, workspace/run changes,
closed captures, session/CSRF failures, storage errors and competing workers.

## Future approved local end-to-end plan — not executed

1. Prefer a separately approved disposable PostgreSQL 17 backend installation first.
   Review migration/identity/scope prerequisites and target identity. Do not reuse the
   unconfirmed development database merely to test delivery.
2. Configure the reviewed backend with existing demo gates and exact Lab-origin CORS,
   keeping HttpOnly/SameSite/CSRF and compatible approved cookie transport settings.
   Never use wildcard CORS, a backend credential proxy, or Python-held officer secrets.
3. Start a fresh local Python workspace, pause generation after a small sample, and
   obtain its actual run manifest/workspace/source identities. Have the authorized
   officer register the capture with intended existing crew-code mappings. Perform
   separately approved scope provisioning and inspect its audit results.
4. Explicitly enable the Lab build, sign in as that capture's creator, verify its
   displayed binding, approve, and submit one small frozen snapshot. Verify server
   headers/subtypes/receipts and demo markings through approved backend inspection.
5. Verify unchanged retry, interrupted-reply recovery, reload, missing-scope rejection,
   expired session, two tabs and separate runs. Confirm only receipt-safe retries occur.
   Stop before changing workspace; exercise restart detection in the disposable setup.
6. Review these results before permitting ongoing operator-controlled delivery to a
   development installation. No alerts, ML inference, clinical thresholds, personal
   baseline provisioning, main-frontend synchronization or silent background sender is
   part of this workflow.
