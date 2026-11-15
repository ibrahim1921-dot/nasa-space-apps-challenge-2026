'use client';

import StatusChip from '../../components/StatusChip.jsx';
import { FreshnessChip, Icon, TimesLine } from './GroundBits.jsx';

function CrewCard({ member, profile, onOpen }) {
  const em = member.openEmergency;
  const reasons = member.reasons.slice(0, 2);
  return (
    <article className={`gr-card gr-crew${em ? ` gr-crew--${em.drill ? 'drill' : 'emergency'}` : ''}`} aria-labelledby={`gr-crew-${member.id}`}>
      <header className="gr-crew__head">
        <h3 id={`gr-crew-${member.id}`} className="gr-crew__name">
          {member.name}
        </h3>
        <span className="gr-muted">{member.title ?? member.role}</span>
      </header>
      {em && (
        <p className={`gr-crew__em gr-crew__em--${em.drill ? 'drill' : 'real'}`}>
          <Icon name="warning" /> Open emergency{em.drill ? ' (DRILL)' : ''}
        </p>
      )}
      <div className="gr-crew__status">
        <StatusChip status={member.status} icon />
      </div>
      {reasons.length ? (
        <ul className="gr-crew__reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          {member.reasons.length > 2 && <li className="gr-muted">+{member.reasons.length - 2} more</li>}
        </ul>
      ) : (
        <p className="gr-muted gr-crew__reasons">No reasons flagged.</p>
      )}
      <div className="gr-crew__fresh">
        <FreshnessChip freshness={member.freshness} />
      </div>
      <p className="gr-crew__times">
        <TimesLine recordedAt={member.lastRecordedAt} profile={profile} />
      </p>
      <button type="button" className="gr-btn gr-btn--primary gr-crew__open" onClick={() => onOpen(member.id)} aria-label={`Open ${member.name}`}>
        Open
      </button>
    </article>
  );
}

export default function CrewOverview({ crew, info, onOpen }) {
  const counts = crew.reduce((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});
  return (
    <section aria-labelledby="gr-overview-title">
      <div className="gr-section-head">
        <h2 id="gr-overview-title">Crew overview</h2>
        <p className="gr-muted">
          {crew.length} crew · {counts.alert ?? 0} alert · {counts.watch ?? 0} watch · {counts.normal ?? 0} normal · open emergencies first
        </p>
      </div>
      <p className="gr-rule">{info.freshnessRule.label}. Freshness uses the demo clock (demo day {info.today}).</p>
      <div className="gr-grid">
        {crew.map((m) => (
          <CrewCard key={m.id} member={m} profile={info.profile} onOpen={onOpen} />
        ))}
      </div>
      <p className="gr-source gr-muted">
        Source: this browser. Synthetic crew records (crew.json), simulated sensor days and readings saved on this device, scored the same way as the
        CMO&apos;s Crew tab.
      </p>
    </section>
  );
}
