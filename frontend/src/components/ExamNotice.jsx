'use client';

// On a crew member's own Today: "Lena recorded an exam for you at 14:02", dismissible. Dismissals are
// remembered per crew member and record (localStorage `ahm.examSeen.v1`, keys "crew-02:<record id>"),
// so on a shared device one person dismissing does not hide another person's notice.

import { useEffect, useState } from 'react';
import DeviceIcon from './DeviceIcon.jsx';

export const EXAM_SEEN_KEY = 'ahm.examSeen.v1';
const MAX_SEEN = 200;

const seenKey = (crewId, id) => `${crewId}:${id}`;

function readSeen() {
  try {
    const list = JSON.parse(window.localStorage.getItem(EXAM_SEEN_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(list) {
  try {
    window.localStorage.setItem(EXAM_SEEN_KEY, JSON.stringify(list.slice(-MAX_SEEN)));
  } catch {
    // storage blocked: dismissed for this page view only
  }
}

const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** @param {{ crewId: string, exams: object[] }} props  exam records for this crew member, any order */
export default function ExamNotice({ crewId, exams }) {
  const [seen, setSeen] = useState(null);
  useEffect(() => setSeen(readSeen()), []);
  if (!seen) return null;
  const shown = exams
    .filter((r) => !seen.includes(seenKey(crewId, r.id)))
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0];
  if (!shown) return null;
  const by = (shown.payload?.entered_by?.name ?? 'The CMO').split(' ')[0];

  function dismiss() {
    const next = [...readSeen().filter((k) => k !== seenKey(crewId, shown.id)), seenKey(crewId, shown.id)];
    writeSeen(next);
    setSeen(next);
  }

  return (
    <div className="exam-notice" role="status">
      <DeviceIcon device="exam" size={18} />
      <p className="exam-notice__text">
        <strong>{by}</strong> recorded an exam for you at <time dateTime={shown.recorded_at}>{time(shown.recorded_at)}</time>.
        {shown.payload?.note ? <span className="muted"> Note: {shown.payload.note}</span> : null}
      </p>
      <button type="button" className="btn btn--secondary exam-notice__close" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
