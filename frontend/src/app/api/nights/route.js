import { SOURCE_PHYSIONET } from '../../../lib/nightlyScore.js';
import { getLoggedNights, getRecordedNights, getScoredFile, getSubjects } from '../../../lib/nightsData.js';

export const dynamic = 'force-dynamic';

/** GET /api/nights[?subject=Bidslab00] — stored scored nights, plus nights logged on this server instance. */
export function GET(request) {
  const subject = new URL(request.url).searchParams.get('subject');
  const scored = getScoredFile();
  const subjects = getSubjects();

  if (subject !== null && !subjects.includes(subject)) {
    return Response.json(
      { source: SOURCE_PHYSIONET, error: `Unknown subject "${subject}". Use one of the ids in /api/nights.` },
      { status: 404 },
    );
  }

  const stored = scored.nights
    .filter((n) => subject === null || n.subject_id === subject)
    .map((n) => {
      // Hours asleep come from the recorded night, for the fixed sleep-duration check.
      const row = getRecordedNights(n.subject_id).find((r) => r.night_index === n.night_index);
      return { ...n, total_sleep_h: row?.total_sleep_h ?? null, logged: false };
    });

  const loggedSubjects = subject === null ? subjects : [subject];
  const logged = loggedSubjects.flatMap((s) =>
    getLoggedNights(s).map((e) => ({
      id: e.id,
      subject_id: s,
      logged_at: e.logged_at,
      date: e.date,
      ...e.result,
      night: e.night,
      logged: true,
    })),
  );

  return Response.json({
    source: SOURCE_PHYSIONET,
    method: scored.method,
    thresholds: scored.thresholds,
    subjects,
    count: stored.length + logged.length,
    nights: [...logged, ...stored],
  });
}
