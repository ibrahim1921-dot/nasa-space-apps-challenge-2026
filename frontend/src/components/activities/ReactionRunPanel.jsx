import Sparkline from '../Sparkline.jsx';
import { ACTIVITY_SETTINGS } from '../../content/activities.js';

/**
 * Vitals → Reaction time: the Reaction Run history under the crew-record card. Never a status colour:
 * the card above keeps the crew record's value and status.
 * @param {{ panel: ReturnType<import('../../lib/activities.js').reactionPanel>, onPlay?: () => void }} props
 */
export default function ReactionRunPanel({ panel, onPlay }) {
  const { label, history, latest, usual, sessions } = panel;
  return (
    <section className="card rr-panel" aria-labelledby="rr-panel-title">
      <div className="card__head">
        <h3 id="rr-panel-title" className="card__title">
          Reaction Run
        </h3>
        <span className="act-tag">{label}</span>
      </div>
      {sessions === 0 ? (
        <p className="muted">No Reaction Run yet. Three minutes, any time outside rest hours.</p>
      ) : (
        <>
          <div className="rr-panel__row">
            <p className="rr-panel__value">
              <span className="num">{latest?.data.median_ms ?? '—'}</span>
              <span className="indicator__unit">ms</span>
              <span className="muted rr-panel__sub"> last session</span>
            </p>
            <Sparkline values={history} status="activity" />
          </div>
          <p className="muted">
            {usual
              ? `Your usual: ${usual.usual_ms} ms (median of your last ${usual.sessions} sessions).`
              : `Your usual appears after ${ACTIVITY_SETTINGS.reaction.baselineMinSessions} sessions (${sessions} so far).`}
          </p>
        </>
      )}
      {onPlay && (
        <button type="button" className="btn act-btn" onClick={onPlay}>
          Play Reaction Run
        </button>
      )}
    </section>
  );
}
