# React Simulation Lab

A separate local development/demo interface. It does not import `frontend/`,
create alerts, load the trained model, or generate
measurements in JavaScript. All readings, contexts, references, cadences and
synthetic observations come from the Python engine through `simulation/api/`.
Phase 4C.5 adds a disabled-by-default, explicit browser/officer delivery panel;
see [the delivery workflow and current CORS/cookie blockers](../DELIVERY.md).

## Launch both processes

Terminal 1, repository root:

```powershell
python -m simulation.api
```

If the Windows `python` alias is unavailable:

```powershell
& "$env:LOCALAPPDATA/Programs/Python/Python314/python.exe" -m simulation.api
```

Terminal 2, repository root:

```powershell
cd simulation/ui
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Node 24 is tested; use a Node version supported
by the pinned Vite release. Dependencies are independent: install only in this
directory, never in the existing frontend. The lockfile is committed.

The UI's Vite server binds to loopback, refuses a conflicting port, and proxies
`/api` to `127.0.0.1:8765` (or the explicit local `LAB_PYTHON_PORT`). It strips
credential/CSRF headers from that Python proxy; browser engine requests omit credentials.
There is no Spring proxy. An unavailable API shows an explicit disconnected state;
the browser does not fabricate fallback values or advance the simulator itself.
Close both terminals with Ctrl+C when finished. Neither process starts PostgreSQL
or applies any migrations. See [API security limitations](../api/README.md).

## Working with the lab

1. Choose a fictional astronaut and click **Start**. All three subjects are
   simulated by the one Python clock; switching subjects never resets it.
2. Pause/resume affect the actual engine. While paused, the clock, RNG and dose
   accumulation stop; the plots are not fed invented refresh-time values.
3. Scenario presets apply to Python immediately, including while RUNNING.
   Slider/acceleration changes are staged, visibly marked UNAPPLIED, then sent
   together by **Apply parameters**. Changing controls preserves run/history.
4. Exercise/Recovery start their opening phase at the time of the preset change.
   Normal follows the engine's UTC schedule. Stress/Sleep Deprivation and Elevated
   Radiation use the existing synthetic scenario effects, not clinical policies.
5. Speed choices are 1 virtual hour, 1 virtual day or 7 virtual days per driver
   second. At high speed, short phases may pass between screen refreshes but their
   emitted measurements remain in the plots. Use slower speed for acute changes.
6. **+1 day / +28 days** explicitly fast-forward the Python engine. Bone first
   appears after 28 virtual days; muscle after seven. Empty plots and waiting
   labels are intentional. The daily sleep row represents a completed session.
7. The nine family cards show canonical units. BP components share an axis;
   muscle grip (`kgf`) and mass (`kg`) use separate plots. Original and
   context-specific synthetic reference lines are copied from Python values.
   The context shown with a reading is the context at its last measurement, which
   may differ from the engine's current phase. Baselines shown before a sample
   are explicitly configured parameters, not inferred readings.
8. **Reset** uses the entered seed, creates a new run and dose origin at the
   current virtual time, and returns READY. Earlier observations remain under
   **View run**. Historical views disable mutations; return to the current run to
   control it. The header shows the current engine clock/run/origin, while the
   historical banner identifies the selected past origin.

Every card and chart is labeled synthetic. Baselines are references, not alert
thresholds. Lines connect actual measured points, with no fabricated intermediate
samples or smoothing model. Plots show up to 120 points per metric and selected
run; total counts include retained data. A process restart clears the in-memory
lab workspace; reset does not clear it. The local API pauses at its memory budget
rather than silently discarding earlier runs.

## Build and tests

From `simulation/ui`:

```powershell
npm test
npm run build
npm run preview
```

Preview serves the build at **http://127.0.0.1:4173**, with the same local Python
proxy. The built files are not a production deployment and cannot execute Python
without the separately running API. React and React DOM are the only runtime
dependencies; Vite builds it and native SVG draws the plots.

For the real browser test, start a **fresh** Python API (READY with no previous
test workspace) on 8765, and stop any manually started Vite server on 5173:

```powershell
npm run test:e2e
```

Playwright launches/stops its own Vite server and uses installed Microsoft Edge
by default. This was tested with headless Edge on Windows, including populated
1440-pixel desktop and 390-pixel mobile screenshots under ignored `test-results/`.
For installed Chrome use `LAB_BROWSER_CHANNEL=chrome`. For a Playwright-managed
Chromium installation, install it locally with `npx playwright install chromium`
and set `LAB_BROWSER_CHANNEL=chromium`. No browser download is needed for Edge.
Restart the API before repeating the full browser suite: it deliberately advances
28 days and retains previous runs rather than deleting them for test cleanup.

The browser test uses real HTTP engine responses, not mocked data. It verifies
all nine families and units, lifecycle, pause/no new records, slider application,
acceleration, live preset changes, selection, slow-indicator arrival, reset and
retained-run charts. It checks responsive width and uncaught browser errors.
Pure Node tests cover presentation-only concerns: distinct unit axes, no fabricated
empty values, and plotting measured timestamps. The Python tests cover actual
probabilistic effects and HTTP protections.

## Remaining integration

The optional [officer delivery panel](../DELIVERY.md) reuses existing backend capture,
mapping, scope and ingestion endpoints. Actual development prerequisites and compatible
CORS/cookies remain unconfirmed; no live ingestion is performed automatically.
Durable Python export history, live-control schedule recording for exact replay, and
any approved monitoring/model integration remain separate tasks. The existing
[threshold audit](../THRESHOLD_AUDIT.md) still applies. No threshold, clinical
guidance, database row, medical alert, or trained inference is added by this UI.
