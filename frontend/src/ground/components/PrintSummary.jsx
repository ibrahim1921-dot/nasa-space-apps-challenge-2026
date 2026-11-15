'use client';

// The printed page for one crew member (shown only when printing; see ground.css @media print).

import { useMemo } from 'react';

export default function PrintSummary({ source, version, crewId }) {
  const summary = useMemo(() => source.summaryFor(crewId), [source, version, crewId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!summary) return null;
  const b = summary.blocks;
  return (
    <article className="gr-print">
      <h1>{b.title}</h1>
      <p>{b.subtitle}</p>
      <h2>Status: {b.status.label}</h2>
      {b.status.reasons.length ? (
        <ul>
          {b.status.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <p>No reasons flagged.</p>
      )}
      <p>
        Freshness: {b.freshness.label} · {b.freshness.text}
        <br />
        Last record: {b.lastRecord}
      </p>

      <h2>Last {b.days.length} days of readings</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Reading</th>
            <th>Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {b.days.flatMap((d) =>
            d.items.length
              ? d.items.map((it, i) => (
                  <tr key={`${d.date}-${it.label}`}>
                    <td>{i === 0 ? d.date : ''}</td>
                    <td>{it.label}</td>
                    <td>
                      {it.value} {it.unit}
                    </td>
                    <td>{it.provenance}</td>
                  </tr>
                ))
              : [
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td colSpan={3}>No complete readings</td>
                  </tr>,
                ],
          )}
        </tbody>
      </table>

      <h2>CMO exams</h2>
      {!b.exams.length && <p>None on this device.</p>}
      {b.exams.map((x) => (
        <div key={x.id}>
          <p>
            <strong>{x.when}</strong> · by {x.by}
          </p>
          <ul>
            {x.values.map((v) => (
              <li key={v.id}>
                {v.label}: {v.value} {v.unit}
              </li>
            ))}
          </ul>
          {x.note && <p>Note: {x.note}</p>}
        </div>
      ))}

      <h2>Open and recent emergencies</h2>
      {!b.emergencies.length && <p>None.</p>}
      {b.emergencies.map((e) => (
        <pre key={e.id}>{e.text}</pre>
      ))}
      <p className="gr-print__foot">{b.footer}</p>
    </article>
  );
}
