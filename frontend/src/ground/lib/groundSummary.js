// A printable summary for one crew member, from existing data only: latest status and reasons, the
// last 7 timeline days with where each value came from, CMO exams, and open and recent emergencies
// (their handoff text comes from lib/emergency.js summaryText, through emergencyView.js).
// Pure: everything is passed in. `blocks` is plain data for the print view; `text` is plain text.

import { STATUS_LABELS } from '../../constants/status.js';
import { handoffText, isRecent, latestReadingsFrom } from './emergencyView.js';
import { dateText, delayLabel, timesText } from './delay.js';

export const SUMMARY_DAYS = 7;

/** The last `days` timeline days on or before today, oldest first, each with its values and provenance. */
export function lastDays(timeline, { today, seededCount = 0, days = SUMMARY_DAYS }) {
  const out = [];
  timeline.forEach((d, i) => {
    if (typeof d?.date !== 'string' || (today && d.date > today)) return;
    const r = latestReadingsFrom(timeline.slice(0, i + 1), { today, seededCount });
    out.push({ date: d.date, missionDay: d.missionDay ?? null, items: r.items });
  });
  return out.slice(-days);
}

/**
 * @param {object} p
 * @param {object} p.member      groundSource crewList() item
 * @param {object[]} p.timeline  buildTimeline() output
 * @param {object[]} p.records   groundSource recordsFor() items
 * @param {object[]} p.emergencies  raw emergency records about this person
 * @param {object} p.profile     mission profile
 * @param {string} p.today       demo date
 * @param {number} p.seededCount crew.json days at the start of the timeline
 * @param {number} p.nowMs       real clock, for "recent" emergencies
 * @returns {{ blocks: object, text: string }}
 */
export function buildGroundSummary({ member, timeline, records, emergencies = [], profile, today, seededCount, nowMs = Date.now() }) {
  const days = lastDays(timeline, { today, seededCount });
  const exams = records.filter((r) => r.kind === 'exam');
  const ems = emergencies.filter((e) => !e.ended_at || isRecent(e, nowMs));
  const blocks = {
    title: `${member.name} (${member.id}) · ${member.title ?? member.role}`,
    subtitle: `Ground summary · demo day ${today} · ${delayLabel(profile)}`,
    status: { status: member.status, label: STATUS_LABELS[member.status] ?? member.status, reasons: member.reasons },
    freshness: member.freshness,
    lastRecord: member.lastRecordedAt ? timesText(member.lastRecordedAt, profile) : 'No record yet',
    days,
    exams: exams.map((x) => ({
      id: x.id,
      when: `${dateText(x.recorded_at)} · ${timesText(x.recorded_at, profile)}`,
      by: x.entered_by?.name ?? 'CMO',
      values: x.values,
      note: x.note,
    })),
    emergencies: ems.map((e) => ({
      id: e.id,
      open: !e.ended_at,
      drill: e.drill,
      text: handoffText(e, { timeline, today, seededCount, profile }),
    })),
    footer: 'Built from data on this device: synthetic crew records, simulated sensors and readings saved here. Not a diagnosis.',
  };
  return { blocks, text: summaryPlainText(blocks) };
}

/** The blocks as plain text. */
export function summaryPlainText(b) {
  const lines = [b.title, b.subtitle, ''];
  lines.push(`Status: ${b.status.label}`);
  if (b.status.reasons.length) b.status.reasons.forEach((r) => lines.push(`- ${r}`));
  else lines.push('- No reasons flagged.');
  lines.push(`Freshness: ${b.freshness.label} · ${b.freshness.text}`);
  lines.push(`Last record: ${b.lastRecord}`);
  lines.push('', `Last ${b.days.length} days of readings:`);
  for (const d of b.days) {
    lines.push(`${d.date}${d.missionDay ? ` (mission day ${d.missionDay})` : ''}`);
    if (!d.items.length) lines.push('  (no complete readings)');
    for (const it of d.items) lines.push(`  ${it.label}: ${it.value} ${it.unit} (${it.provenance})`);
  }
  lines.push('', 'CMO exams:');
  if (!b.exams.length) lines.push('- None on this device.');
  for (const x of b.exams) {
    lines.push(`- ${x.when} · by ${x.by}`);
    for (const v of x.values) lines.push(`    ${v.label}: ${v.value} ${v.unit}`);
    if (x.note) lines.push(`    Note: ${x.note}`);
  }
  lines.push('', 'Open and recent emergencies:');
  if (!b.emergencies.length) lines.push('- None.');
  for (const e of b.emergencies) lines.push('', e.text);
  lines.push('', b.footer);
  return lines.join('\n');
}
