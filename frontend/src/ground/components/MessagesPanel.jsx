'use client';

// Advice from the ground team: a composer and the sent list. Messages reach the crew one signal delay
// after sending. They are advice and reminders, never medical orders; this console never suggests
// drugs or doses.

import { useEffect, useState } from 'react';
import { MAX_BODY, MAX_SUBJECT, RECIPIENTS, TEMPLATES, TEMPLATE_NOTE, fillTemplate, recipientLabel, status } from '../lib/messages.js';
import { sentText } from '../lib/delay.js';
import { Icon } from './GroundBits.jsx';

function Composer({ source, draft, setDraft, info, onSent }) {
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const set = (patch) => {
    setDone(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const applyTemplate = (t) => set(fillTemplate(t, draft.to));

  const send = (e) => {
    e.preventDefault();
    const res = source.sendMessage(draft);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setDone(`Sent to ${recipientLabel(res.message.to)}. ${status(res.message, Date.now()).text}.`);
    setDraft({ to: draft.to, subject: '', body: '', priority: 'routine', related: { kind: null, id: null } });
    onSent();
  };

  return (
    <form className="gr-card gr-panel gr-composer" onSubmit={send} aria-labelledby="gr-compose-title" noValidate>
      <h3 id="gr-compose-title">New message</h3>
      <p className="gr-muted">Reaches the crew one signal delay after sending ({info.delayLabel}). Advice and reminders only: never drugs or doses.</p>

      <div className="gr-form-row">
        <label htmlFor="gr-to">To</label>
        <select id="gr-to" className="gr-input" value={draft.to} onChange={(e) => set({ to: e.target.value })}>
          {RECIPIENTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <fieldset className="gr-priority">
          <legend>Priority</legend>
          {['routine', 'urgent'].map((p) => (
            <label key={p} className="gr-radio">
              <input type="radio" name="gr-priority" value={p} checked={draft.priority === p} onChange={() => set({ priority: p })} />
              {p === 'routine' ? 'Routine' : 'Urgent'}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="gr-templates">
        <span className="gr-muted">Templates:</span>
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="gr-btn gr-btn--ghost" onClick={() => applyTemplate(t)}>
            {t.label}
          </button>
        ))}
        <span className="gr-muted gr-templates__note">{TEMPLATE_NOTE}</span>
      </div>

      <label htmlFor="gr-subject">Subject</label>
      <input id="gr-subject" className="gr-input" value={draft.subject} maxLength={MAX_SUBJECT} onChange={(e) => set({ subject: e.target.value })} />

      <label htmlFor="gr-body">Message</label>
      <textarea id="gr-body" className="gr-input gr-textarea" rows={6} value={draft.body} maxLength={MAX_BODY} onChange={(e) => set({ body: e.target.value })} aria-describedby="gr-body-count" />
      <p id="gr-body-count" className="gr-muted gr-count-line">
        {draft.body.length} / {MAX_BODY}
      </p>

      {draft.related?.kind && (
        <p className="gr-related">
          About {draft.related.kind === 'emergency' ? 'an emergency' : 'a record'} ({draft.related.id.slice(0, 8)}…){' '}
          <button type="button" className="gr-btn gr-btn--ghost" onClick={() => set({ related: { kind: null, id: null } })}>
            Remove link
          </button>
        </p>
      )}

      <div className="gr-composer__actions">
        <button type="submit" className="gr-btn gr-btn--primary">
          Send
        </button>
        {error && (
          <span className="gr-error" role="alert">
            {error}
          </span>
        )}
        {done && (
          <span className="gr-ok" role="status">
            {done}
          </span>
        )}
      </div>
    </form>
  );
}

function SentList({ messages, profile }) {
  const [now, setNow] = useState(() => Date.now());
  const anyTransit = messages.some((m) => status(m, now).state === 'transit');
  useEffect(() => {
    if (!anyTransit) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyTransit]);
  useEffect(() => setNow(Date.now()), [messages]);

  return (
    <section className="gr-card gr-panel" aria-labelledby="gr-sent-title">
      <h3 id="gr-sent-title">Sent</h3>
      {!messages.length && <p className="gr-muted">Nothing sent from this browser yet.</p>}
      <ol className="gr-sent">
        {messages.map((m) => {
          const s = status(m, now);
          return (
            <li key={m.id} className="gr-sent__item">
              <div className="gr-sent__head">
                <strong>{m.subject}</strong>
                {m.priority === 'urgent' && <span className="gr-tag gr-tag--urgent">Urgent</span>}
                <span className={`gr-tag gr-tag--${s.state}`}>
                  <Icon name={s.state} />
                  {s.text}
                </span>
              </div>
              <p className="gr-muted">
                To {recipientLabel(m.to)} · from {m.from.name} · {sentText(m.sent_at, profile)}
                {m.related.kind && ` · about ${m.related.kind === 'emergency' ? 'an emergency' : 'a record'}`}
              </p>
              <p className="gr-sent__body">{m.body}</p>
            </li>
          );
        })}
      </ol>
      <p className="gr-muted">&ldquo;Read&rdquo; appears once the crew app has an inbox (coming later).</p>
    </section>
  );
}

export default function MessagesPanel({ source, messages, draft, setDraft, info, onSent }) {
  return (
    <section aria-labelledby="gr-msg-title">
      <div className="gr-section-head">
        <h2 id="gr-msg-title">Messages</h2>
        <p className="gr-muted">Advice to the CMO or a crew member. Saved in this browser.</p>
      </div>
      <div className="gr-two">
        <Composer source={source} draft={draft} setDraft={setDraft} info={info} onSent={onSent} />
        <SentList messages={messages} profile={info.profile} />
      </div>
    </section>
  );
}
