import { INDICATOR_NAMES, LIMITS, SOURCES } from '../content/limits.js';
import { describeLimit } from '../lib/rangeCheck.js';
import StatusIcon from '../components/StatusIcon.jsx';

const nameOf = (id) => INDICATOR_NAMES[id] ?? id;

/** About this app: how statuses are set, every cited source, and every team-set line. */
export default function About() {
  const teamSet = LIMITS.filter((l) => l.team_set);

  return (
    <div className="about">
      <section className="card card--lg" aria-labelledby="about-title">
        <h2 id="about-title" className="view-title">
          About this app
        </h2>
        <p className="muted about__lead">
          Each reading gets one of three statuses. Fixed limits come from the published sources below. Where no
          published line fits, the team set one, and the app labels it as team-set. Recorded measurements may also be compared with the same person&apos;s own history.
        </p>
        <ul className="about__statuses" aria-label="Statuses">
          {['normal', 'watch', 'alert'].map((s) => (
            <li key={s} className={`chip chip--${s}`}>
              <StatusIcon status={s} />
              {s === 'normal' ? 'Normal: inside the limits' : s === 'watch' ? 'Watch: keep an eye on it' : 'Alert: act now'}
            </li>
          ))}
        </ul>
      </section>

      <section className="card card--lg" aria-labelledby="sources-title">
        <h2 id="sources-title" className="card__title">
          Sources
        </h2>
        <ol className="sources">
          {SOURCES.map((s) => (
            <li key={s.url} className="sources__item">
              <p className="sources__name">{s.name}</p>
              <a className="limits__source sources__link" href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="sources__used muted">Used for: {s.indicators.map(nameOf).join(', ')}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card card--lg" aria-labelledby="teamset-title">
        <h2 id="teamset-title" className="card__title">
          Team-set lines
        </h2>
        <p className="muted">These are the team&apos;s choices, not clinical standards.</p>
        <ul className="limits__list about__teamset">
          {teamSet.map((l) => (
            <li key={`${l.indicator}-${l.level}-${l.rule}-${l.value}`} className="limits__item">
              <span className="limits__group-title">{nameOf(l.indicator)}</span>
              <span className={`limits__rule status-text--${l.level}`}>
                <StatusIcon status={l.level} size={13} />
                {describeLimit(l)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
