import StatusChip from './StatusChip.jsx';
import TrendIndicator from './TrendIndicator.jsx';
import ErrorPanel from './ErrorPanel.jsx';

function describeChange(change) {
  if (change > 0) return { trend: 'up', text: `Up ${change} since yesterday` };
  if (change < 0) return { trend: 'down', text: `Down ${Math.abs(change)} since yesterday` };
  return { trend: 'flat', text: 'No change since yesterday' };
}

const TICKS = [0, 50, 75, 100];

/** @param {{ state: object, label?: string }} props  label: where the score comes from; "Sample" when absent */
export default function OverallHealthCard({ state, label = null }) {
  const { data, loading, error, reload } = state;
  const score = data ? Math.min(100, Math.max(0, Math.round(data.score))) : 0;
  const change = data ? describeChange(data.changeSinceYesterday) : null;

  return (
    <section className="card card--lg" aria-labelledby="overall-title">
      <div className="card__head">
        <h2 id="overall-title" className="card__title">Overall health</h2>
        {data && !error && <StatusChip status={data.status} />}
      </div>
      {label ? <p className="indicator__source">{label}</p> : <p className="indicator__sample">Sample</p>}

      {loading && (
        <div aria-hidden="true">
          <span className="skel" style={{ width: 140, height: 44, marginBottom: 10 }} />
          <span className="skel" style={{ width: '50%', height: 14, marginBottom: 18 }} />
          <span className="skel" style={{ width: '100%', height: 10, marginBottom: 18 }} />
          <span className="skel" style={{ width: '80%', height: 14 }} />
        </div>
      )}

      {!loading && error && <ErrorPanel onRetry={reload} />}
      {!loading && !error && !data && <p className="muted">No recorded measurements available.</p>}

      {!loading && !error && data && (
        <>
          <p className="overall__score">
            <span className="num overall__num">{score}</span>
            <span className="overall__max"> / 100</span>
          </p>
          <TrendIndicator trend={change.trend} text={change.text} />

          <div
            className="scorebar"
            role="img"
            aria-label={`Score ${score} out of 100. Below 50 is alert, 50 to 74 is watch, 75 and above is normal.`}
          >
            <div className="scorebar__track">
              <span className="scorebar__seg scorebar__seg--red" />
              <span className="scorebar__seg scorebar__seg--yellow" />
              <span className="scorebar__seg scorebar__seg--green" />
            </div>
            <span className="scorebar__marker" style={{ left: `${score}%` }} />
          </div>
          <div className="scorebar__ticks" aria-hidden="true">
            {TICKS.map((t) => (
              <span key={t} style={{ left: `${t}%` }}>
                {t}
              </span>
            ))}
          </div>

          <p className="overall__reason">{data.reason}</p>
        </>
      )}
    </section>
  );
}
