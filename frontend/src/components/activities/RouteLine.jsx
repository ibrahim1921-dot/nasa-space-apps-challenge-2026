import { GAME_SCALE_LABEL } from '../../content/activities.js';

const km = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} million km` : `${Math.round(n).toLocaleString('en-GB')} km`);

/**
 * The shared ship on its route (Earth → Moon or Earth → Mars), the four milestones and the crew's total
 * minutes. Labelled "Team-set · game scale" so nobody reads it as a real distance.
 * @param {{ progress: ReturnType<import('../../lib/activities.js').journeyProgress>, mine?: number|null, headingLevel?: 2|3 }} props
 */
export default function RouteLine({ progress, mine = null, headingLevel = 3 }) {
  const { route, totalMinutes, km: at, fraction, milestones } = progress;
  const H = `h${headingLevel}`;
  const pct = Math.round(fraction * 1000) / 10;
  // Ship position along the line, kept inside the end points.
  const x = 24 + fraction * 252;
  return (
    <section className="card journey" aria-labelledby="journey-title">
      <div className="card__head">
        <H id="journey-title" className="card__title">
          Crew Journey: {route.from} → {route.to}
        </H>
        <span className="act-tag">{GAME_SCALE_LABEL}</span>
      </div>
      <svg className="journey__line" viewBox="0 0 300 64" role="img" aria-label={`The crew ship is ${pct}% of the way from ${route.from} to ${route.to}.`}>
        <line x1="24" y1="34" x2="276" y2="34" className="journey__track" />
        <line x1="24" y1="34" x2={x} y2="34" className="journey__done" />
        {milestones.map((m) => {
          const mx = 24 + (m.km / route.totalKm) * 252;
          return <circle key={m.id} cx={mx} cy="34" r="3.5" className={m.reached ? 'journey__tick is-reached' : 'journey__tick'} />;
        })}
        <circle cx="24" cy="34" r="9" className="journey__earth" />
        <circle cx="276" cy="34" r={route.id === 'mars' ? 8 : 7} className={`journey__dest journey__dest--${route.id}`} />
        <g transform={`translate(${x} 18)`} className="journey__ship">
          <path d="M-7 4 L7 0 L-7 -4 L-4 0 Z" />
        </g>
        <text x="24" y="60" textAnchor="middle" className="journey__label">
          {route.from}
        </text>
        <text x="276" y="60" textAnchor="middle" className="journey__label">
          {route.to}
        </text>
      </svg>
      <p className="journey__total">
        <span className="num">{totalMinutes.toLocaleString('en-GB')}</span> crew minutes · {km(at)} of {km(route.totalKm)}{' '}
        <span className="muted">({GAME_SCALE_LABEL.toLowerCase()}: 1 crew minute = {km(route.kmPerMinute)})</span>
      </p>
      {mine !== null && <p className="journey__mine">{mine > 0 ? `You added ${mine} min.` : 'You haven’t added minutes yet.'}</p>}
      <ol className="journey__milestones" aria-label="Milestones">
        {milestones.map((m) => (
          <li key={m.id} className={m.reached ? 'is-reached' : undefined}>
            <span className="journey__mark" aria-hidden="true">
              {m.reached ? '✓' : '○'}
            </span>
            {m.note}
            <span className="sr-only">{m.reached ? ' (reached)' : ' (not yet)'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
