import React, { useEffect, useRef, useState } from 'react';
import { DeliveryClient } from './delivery.js';

export function DeliveryPanel() {
  if (import.meta.env.VITE_SIMULATION_DELIVERY_ENABLED !== 'true') return <section className="delivery-panel delivery-disabled" aria-label="Spring Boot delivery">
    <strong>Spring Boot delivery is disabled.</strong><span>No observations are submitted. Delivery needs explicit local configuration and officer approval.</span>
  </section>;
  return <EnabledDeliveryPanel />;
}

function EnabledDeliveryPanel() {
  const [view, setView] = useState({ status: 'Not authorized' });
  const [working, setWorking] = useState(false), [message, setMessage] = useState('');
  const [approved, setApproved] = useState(false), [captureId, setCaptureId] = useState('');
  const login = useRef(), password = useRef();
  const [configured] = useState(() => {
    try { return { client: new DeliveryClient({ enabled: true, backendOrigin: import.meta.env.VITE_SPRING_BOOT_ORIGIN,
      pythonPort: __LAB_PYTHON_PORT__, onChange: setView }) }; }
    catch (error) { return { error: error.message }; }
  });
  const client = configured.client;
  useEffect(() => () => client?.stop(), [client]);
  const busy = working || view.running;
  async function action(callback) {
    if (busy) return;
    setWorking(true); setMessage('');
    try { await callback(); }
    catch (error) { setMessage(error.message); }
    finally { setWorking(false); if (client) setView(client.view()); }
  }
  const binding = view.binding;
  return <section className="delivery-panel" aria-label="Spring Boot delivery">
    <h2>Deliver synthetic observations <span>Explicit officer action only</span></h2>
    <p>Uses an existing ACTIVE capture and its approved mappings. No accounts, profiles or scopes are created.</p>
    {configured.error ? <p role="alert">{configured.error}</p> : <>
      <p>Spring Boot origin: <code>{client.origin}</code>. Its CORS configuration must explicitly allow this Lab origin and its cookie settings must be compatible.</p>
      <form className="delivery-login" onSubmit={event => {
        event.preventDefault(); const name = login.current.value.trim(), secret = password.current.value;
        password.current.value = ''; setApproved(false);
        action(() => client.signIn(name, secret));
      }}>
        <label>Officer login<input ref={login} autoComplete="username" required disabled={busy} /></label>
        <label>Officer password<input ref={password} type="password" autoComplete="current-password" required disabled={busy} /></label>
        <button disabled={busy} type="submit">Sign in to Spring Boot</button>
        <button disabled={busy} type="button" onClick={() => { setApproved(false); action(() => client.signOut()); }}>End browser session</button>
      </form>
      <div className="delivery-binding">
        <label>Existing capture UUID<input value={captureId} onChange={event => { setCaptureId(event.target.value); setApproved(false); }} disabled={busy} spellCheck="false" /></label>
        <button disabled={busy || !captureId.trim()} onClick={() => { setApproved(false); action(() => client.connect(captureId.trim())); }}>Verify session and capture</button>
      </div>
      {binding && <div className="delivery-identities">
        <p>Capture <code>{binding.captureId}</code><br />Workspace <code>{binding.workspaceId}</code><br />Fixed run <code>{binding.runId}</code></p>
        <p>Chart selection and engine resets never retarget this delivery binding.</p>
        <ul>{binding.mappings.map(mapping => <li key={mapping.mappingId}>
          <code>{mapping.simulationCrewCode}</code> → <code>{mapping.targetCrewCode}</code> / <code>{mapping.astronautId}</code>
        </li>)}</ul>
      </div>}
      <label className="delivery-approval"><input type="checkbox" checked={approved} disabled={!binding || busy} onChange={event => setApproved(event.target.checked)} />
        I authorize this browser to deliver original synthetic observations to the displayed capture.</label>
      <div className="delivery-actions">
        <button disabled={!binding || !approved || busy || captureId.trim() !== binding.captureId}
          onClick={() => action(() => client.deliver({ approved }))}>{view.pending ? 'Retry pending snapshot unchanged' : 'Deliver one frozen snapshot'}</button>
        <button disabled={!view.running} onClick={() => client.stop()}>Stop delivery</button>
      </div>
      <p role="status" data-testid="delivery-status">{view.status}</p>
      <dl className="delivery-counts">
        <div><dt>Confirmed submissions</dt><dd>{(view.counts?.created || 0) + (view.counts?.duplicates || 0)}</dd></div>
        <div><dt>Created, acknowledged</dt><dd>{view.counts?.created || 0}</dd></div>
        <div><dt>Receipt duplicates</dt><dd>{view.counts?.duplicates || 0}</dd></div>
        <div><dt>Other-run records excluded</dt><dd>{view.counts?.excluded || 0}</dd></div>
      </dl>
      <p>Last confirmed export sequence: <strong>{view.confirmed?.sequence || 0}</strong><br />
        Last confirmed checkpoint: <code>{view.confirmed?.url || 'None — no backend acknowledgement yet'}</code></p>
      {view.resumeUrl && <p>Export scan cursor (may pass excluded runs): <code>{view.resumeUrl}</code></p>}
      {view.pending && <p>Original snapshot is saved locally for retry. An interrupted POST may already have committed; receipt idempotency handles an unchanged retry.</p>}
      {(message || view.error) && <p className="delivery-error" role="alert">{message || view.error}</p>}
      <p className="field-hint">Saved checkpoints and pending originals survive reloads in this browser origin. Passwords and CSRF/session secrets are never stored here. Python restart still loses unexported history. No automatic delivery or automatic retries.</p>
    </>}
  </section>;
}
