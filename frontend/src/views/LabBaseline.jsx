'use client';

import { useState } from 'react';
import { useHealthData } from '../hooks/useHealthData.js';
import { getLabs } from '../services/healthService.js';
import LabChart from '../components/LabChart.jsx';
import SourceLabel from '../components/SourceLabel.jsx';
import ErrorPanel from '../components/ErrorPanel.jsx';

const DEFAULT_ANALYTE = 'MCV';

const titleCase = (s) =>
  s.length <= 5 ? s : s.toLowerCase().replace(/(^|[\s(/;-])([a-z])/g, (m, p, c) => p + c.toUpperCase());

export default function LabBaseline() {
  const [analyte, setAnalyte] = useState(DEFAULT_ANALYTE);
  const labs = useHealthData(() => getLabs(analyte), [analyte]);
  const data = labs.data;

  return (
    <section className="card card--lg labs" aria-labelledby="labs-title" aria-busy={labs.refreshing || undefined}>
      <div className="sleep__head">
        <div>
          <h2 id="labs-title" className="view-title">
            Lab baseline
          </h2>
          <p className="muted">
            Blood tests for each crew member from 92 days before launch (L-92) to 194 days after return (R+194),
            compared with their own preflight average.
          </p>
        </div>
        {data?.analytes && (
          <div className="field sleep__picker">
            <label htmlFor="analyte" className="field__label">
              Test
            </label>
            <select id="analyte" className="input" value={analyte} onChange={(e) => setAnalyte(e.target.value)}>
              {data.analytes.map((a) => (
                <option key={a} value={a}>
                  {titleCase(a)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {labs.loading && <span className="skel" style={{ width: '100%', height: 340 }} />}
      {!labs.loading && labs.error && <ErrorPanel onRetry={labs.reload} />}
      {!labs.loading && !labs.error && data && (
        <>
          <h3 className="card__title labs__chart-title">
            {titleCase(analyte)} <span className="muted">({data.rows[0]?.units})</span>
          </h3>
          <LabChart rows={data.rows} />
          {analyte === 'MCV' && (
            <p className="labs__note">
              Inside the normal lab range, but lower than each person&apos;s own preflight average.
            </p>
          )}
        </>
      )}
      <SourceLabel source={data?.source ?? 'NASA Inspiration4'} />
    </section>
  );
}
