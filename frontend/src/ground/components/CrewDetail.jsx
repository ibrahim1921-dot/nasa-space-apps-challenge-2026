'use client';

import { useMemo } from 'react';
import StatusChip from '../../components/StatusChip.jsx';
import Sparkline from '../../components/Sparkline.jsx';
import { ProvenanceChips } from '../../components/ProvenanceChip.jsx';
import { dateText } from '../lib/delay.js';
import { FreshnessChip, TimesLine } from './GroundBits.jsx';

function Trends({ trends }) {
  return (
    <section className="gr-card gr-panel" aria-labelledby="gr-trends-title">
      <h3 id="gr-trends-title">Last 14 days</h3>
      <p className="gr-muted gr-panel__note">One point per timeline day up to the demo&apos;s today; days without a value are skipped.</p>
      <table className="gr-table gr-trends">
        <thead>
          <tr>
            <th scope="col">Reading</th>
            <th scope="col">Trend</th>
            <th scope="col">Latest</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {trends.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.label}</th>
              <td>
                <Sparkline values={t.values} status={t.status ?? 'normal'} width={180} height={32} />
              </td>
              <td>
                {t.latest ? (
                  <>
                    <span className="num">{t.latest}</span> <span className="gr-muted">{t.unit}</span>
                    <span className="gr-muted"> · {dateText(`${t.latestDate}T00:00:00Z`)}</span>
                  </>
                ) : (
                  <span className="gr-muted">No value</span>
                )}
              </td>
              <td>{t.status ? <StatusChip status={t.status} icon /> : <span className="gr-muted">Not scored</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Records({ records, profile, onCompose, name }) {
  return (
    <section className="gr-card gr-panel" aria-labelledby="gr-records-title">
      <h3 id="gr-records-title">Check-ins and exams</h3>
      {!records.length && <p className="gr-muted">No check-ins or CMO exams saved on this device for {name} yet. The trends above use synthetic and simulated days.</p>}
      <ol className="gr-records">
        {records.map((r) => (
          <li key={r.id} className="gr-record">
            <div className="gr-record__head">
              <strong>{r.kind === 'exam' ? 'CMO exam' : 'Daily check-in'}</strong>
              <span className="gr-muted">{dateText(r.recorded_at)}</span>
              {r.status && <StatusChip status={r.status} icon />}
              <ProvenanceChips chips={r.chips} />
            </div>
            <p className="gr-record__times">
              <TimesLine recordedAt={r.recorded_at} profile={profile} />
            </p>
            {r.values.length > 0 && (
              <dl className="gr-values">
                {r.values.map((v) => (
                  <div key={v.id}>
                    <dt>{v.label}</dt>
                    <dd>
                      <span className="num">{v.value}</span> <span className="gr-muted">{v.unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {r.entered_by?.name && <p className="gr-muted">Entered by {r.entered_by.name}</p>}
            {r.note && <p>Note: {r.note}</p>}
            {r.reasons.length > 0 && (
              <ul className="gr-record__reasons">
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="gr-btn gr-btn--ghost"
              onClick={() =>
                onCompose({
                  to: 'cmo',
                  subject: `About ${name}'s ${r.kind === 'exam' ? 'CMO exam' : 'check-in'} on ${dateText(r.recorded_at)}`,
                  related: { kind: 'record', id: r.id },
                })
              }
            >
              Message CMO about this record
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function CrewDetail({ source, version, crewId, info, onBack, onCompose }) {
  const d = useMemo(() => {
    const member = source.crewMember(crewId);
    return member ? { member, trends: source.trendsFor(crewId), records: source.recordsFor(crewId) } : null;
  }, [source, version, crewId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) {
    return (
      <section>
        <p className="gr-error">No crew member {crewId}.</p>
        <button type="button" className="gr-btn" onClick={onBack}>
          Back to overview
        </button>
      </section>
    );
  }
  const { member, trends, records } = d;
  return (
    <section aria-labelledby="gr-detail-title" className="gr-detail">
      <div className="gr-section-head">
        <button type="button" className="gr-btn gr-btn--ghost" onClick={onBack}>
          ← Overview
        </button>
        <h2 id="gr-detail-title">
          {member.name} <span className="gr-muted">· {member.title ?? member.role}</span>
        </h2>
        <div className="gr-detail__actions">
          <button type="button" className="gr-btn" onClick={() => onCompose({ to: 'cmo', subject: `About ${member.name}` })}>
            Message CMO
          </button>
          <button type="button" className="gr-btn gr-btn--primary" onClick={() => window.print()}>
            Print summary
          </button>
        </div>
      </div>

      <div className="gr-card gr-panel gr-detail__status">
        <div className="gr-detail__row">
          <StatusChip status={member.status} icon />
          <FreshnessChip freshness={member.freshness} />
        </div>
        {member.reasons.length ? (
          <ul className="gr-crew__reasons">
            {member.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="gr-muted">No reasons flagged on the latest reading.</p>
        )}
        <p>
          Latest record: <TimesLine recordedAt={member.lastRecordedAt} profile={info.profile} />
        </p>
        <p className="gr-muted gr-rule">{info.freshnessRule.label}.</p>
      </div>

      <Trends trends={trends} />
      <Records records={records} profile={info.profile} onCompose={onCompose} name={member.name.split(' ')[0]} />
    </section>
  );
}
