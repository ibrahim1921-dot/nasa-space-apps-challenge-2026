// Advice messages and their delivery status. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile } from '../../constants/mission.js';
import { MISSION_PROFILES } from '../../constants/mission.js';
import { GROUND_MESSAGES_KEY, MAX_BODY, TEMPLATES, addMessage, fillTemplate, newMessage, readMessages, status, validateDraft } from './messages.js';
import { memoryStorage } from './testFixtures.js';

const AT = '2026-11-14T10:00:00.000Z';
const T = Date.parse(AT);
const draft = { to: 'cmo', subject: 'Check-in', body: 'Please repeat the check-in tomorrow morning.', priority: 'routine', related: { kind: null, id: null } };

test('a new message has the full shape and arrives one delay later', () => {
  const m = newMessage({ ...draft, related: { kind: 'emergency', id: 'em-1' } }, { profile: getProfile('mars'), at: AT, id: 'm1' });
  assert.deepEqual(m, {
    id: 'm1',
    to: 'cmo',
    from: { name: 'Flight surgeon', role: 'flight_surgeon' },
    subject: 'Check-in',
    body: 'Please repeat the check-in tomorrow morning.',
    priority: 'routine',
    related: { kind: 'emergency', id: 'em-1' },
    sent_at: AT,
    arrives_at: '2026-11-14T10:20:00.000Z',
    read_at: null,
  });
});

for (const profile of MISSION_PROFILES) {
  test(`${profile.id}: in transit until the delay has passed, then delivered`, () => {
    const m = newMessage(draft, { profile, at: AT, id: 'x' });
    const delayMs = profile.delaySeconds * 1000;
    if (delayMs > 0) {
      assert.equal(status(m, T).state, 'transit');
      assert.equal(status(m, T + delayMs - 1).state, 'transit');
    } else {
      assert.equal(status(m, T).state, 'delivered');
    }
    assert.equal(status(m, T + delayMs).state, 'delivered');
    assert.equal(status(m, T + delayMs + 60_000).text, 'Delivered');
  });
}

test('the transit text counts down', () => {
  const mars = newMessage(draft, { profile: getProfile('mars'), at: AT, id: 'x' });
  assert.equal(status(mars, T).text, 'In transit (arrives in 20 min)');
  assert.equal(status(mars, T + 14 * 60_000).text, 'In transit (arrives in 6 min)');
  assert.equal(status(mars, T + 19 * 60_000 + 30_000).text, 'In transit (arrives in 30 s)');
  const moon = newMessage(draft, { profile: getProfile('moon'), at: AT, id: 'y' });
  assert.equal(status(moon, T).text, 'In transit (arrives in 1.3 s)');
});

test('read once the crew side sets read_at', () => {
  const m = { ...newMessage(draft, { profile: getProfile('mars'), at: AT, id: 'x' }), read_at: '2026-11-14T10:30:00.000Z' };
  assert.deepEqual(status(m, T + 3600_000), { state: 'read', text: 'Read', remainingMs: 0 });
});

test('drafts are checked: recipient, subject, body length, priority, link', () => {
  assert.equal(validateDraft(draft), null);
  assert.equal(validateDraft({ ...draft, to: 'crew-02' }), null);
  assert.match(validateDraft({ ...draft, to: 'crew-99' }), /who/);
  assert.match(validateDraft({ ...draft, subject: ' ' }), /subject/);
  assert.equal(validateDraft({ ...draft, body: 'x'.repeat(MAX_BODY) }), null);
  assert.match(validateDraft({ ...draft, body: 'x'.repeat(MAX_BODY + 1) }), /1000/);
  assert.match(validateDraft({ ...draft, priority: 'now' }), /Priority/);
  assert.match(validateDraft({ ...draft, related: { kind: 'order', id: 'a' } }), /linked/);
});

test('messages round-trip through ahm.groundMessages.v1, newest first, junk dropped', () => {
  const storage = memoryStorage({ [GROUND_MESSAGES_KEY]: JSON.stringify([{ id: 'bad' }]) });
  const p = getProfile('mars');
  assert.ok(addMessage(storage, newMessage(draft, { profile: p, at: AT, id: 'a' })));
  assert.ok(addMessage(storage, newMessage(draft, { profile: p, at: '2026-11-14T11:00:00.000Z', id: 'b' })));
  assert.deepEqual(readMessages(storage).map((m) => m.id), ['b', 'a']);
  assert.deepEqual(readMessages(memoryStorage({ [GROUND_MESSAGES_KEY]: '{not json' })), []);
});

test('templates are reminders only: no drugs, doses or orders', () => {
  const banned = /\b(mg|mcg|ml|dose|doses|tablet|pill|inject|administer|aspirin|nitro|epinephrine|drug|medication|prescribe)\b/i;
  for (const t of TEMPLATES) {
    const { subject, body } = fillTemplate(t, 'crew-02');
    assert.doesNotMatch(`${subject} ${body}`, banned);
    assert.match(`${subject} ${body}`, /please/i);
  }
  assert.match(fillTemplate(TEMPLATES[0], 'crew-02').subject, /Tomas/);
  assert.match(fillTemplate(TEMPLATES[0], 'cmo').subject, /the crew member/);
});
