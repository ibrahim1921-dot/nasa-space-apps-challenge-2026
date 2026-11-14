import SourceLabel from './SourceLabel.jsx';

/**
 * "What to do now" card for a watch or alert result.
 * @param {{ status, profile, steps: string[], urgent?: string|null, titleId?: string, source?: string }} props
 *   urgent  shown first, above the steps (e.g. "Tell the Crew Medical Officer now" for a hypertensive crisis)
 */
export default function ActionCard({ status, profile, steps, urgent = null, titleId = 'actioncard-title', source }) {
  if (status !== 'watch' && status !== 'alert') return null;
  return (
    <section className={`actioncard actioncard--${status}`} aria-labelledby={titleId}>
      {urgent && (
        <p className="actioncard__urgent" role="alert">
          {urgent}
        </p>
      )}
      <h3 id={titleId} className="actioncard__title">
        What to do now
      </h3>
      <ol className="actioncard__list">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {status === 'alert' && profile && (
        <div className="actioncard__escalate">
          <h4 className="actioncard__subtitle">Escalate to the Flight Surgeon</h4>
          <p>
            Send this result to the Flight Surgeon. Signal delay on this mission profile ({profile.label}):{' '}
            <strong>{profile.delayText}</strong>.
            {profile.delaySeconds >= 60 &&
              ` A reply takes at least ${Math.round((profile.delaySeconds * 2) / 60)} min, so follow the steps above while you wait.`}
          </p>
        </div>
      )}
      <SourceLabel source={source ?? `Action steps for this ${status} result (app guidance)`} />
    </section>
  );
}

/** Steps for a hypertensive-crisis BP reading; the urgent line comes from the limit's `action`. */
export { CRISIS_STEPS } from '../content/actions.js';
