import StatusChip from './StatusChip.jsx';
import TrendIndicator from './TrendIndicator.jsx';
import Sparkline from './Sparkline.jsx';
import LimitsInfo from './LimitsInfo.jsx';
import ActionCard, { CRISIS_STEPS } from './ActionCard.jsx';
import ProvenanceChip from './ProvenanceChip.jsx';
import { WhySection } from './WhyItMatters.jsx';
import ObservationContext from './ObservationContext.jsx';

/** Status chip, or the reason a reading is missing today (never shown as "Normal"). */
export function StatusOrMissing({ indicator }) {
  // Game data (Activities): "Logged · not scored" in place of a status chip.
  if (indicator.notScored) return <span className="act-chip act-chip--tag">{indicator.notScoredText}</span>;
  if (indicator.missing) return <span className="chip chip--muted">{indicator.missingText}</span>;
  return <StatusChip status={indicator.status} />;
}

/** The crisis action card for an indicator whose reading crossed a crisis line (see content/limits.js). */
export function IndicatorAction({ indicator, profile }) {
  if (!indicator.crisis) return null;
  return (
    <ActionCard
      status="alert"
      profile={profile}
      urgent={indicator.action}
      steps={CRISIS_STEPS}
      titleId={`action-${indicator.id}`}
      source="Hypertensive crisis line: American Heart Association · steps: app guidance"
    />
  );
}

/** @param {{ indicator, profile, showWhy?: boolean }} props  showWhy: the Vitals detail adds "What to do" and "Why it matters in space" */
export default function IndicatorCard({ indicator, profile, showWhy = false }) {
  const { name, value, unit, status, trend, trendText, history, limitKey, sample, usual } = indicator;
  return (
    <article className="card indicator">
      <div className="indicator__top">
        <h3 className="indicator__name">{name}</h3>
        <StatusOrMissing indicator={indicator} />
      </div>
      {sample ? (
        <p className="indicator__sample">Sample</p>
      ) : (
        indicator.sourceNote && <p className="indicator__source">{indicator.sourceNote}</p>
      )}
      {indicator.provenance && (
        <p className="indicator__prov">
          <ProvenanceChip chip={indicator.provenance} />
        </p>
      )}
      <p className="indicator__value">
        <span className="num">{value}</span>
        {unit && <span className="indicator__unit">{unit}</span>}
      </p>
      {indicator.preflightAverage && <p className="indicator__preflight">{indicator.preflightAverage.text}</p>}
      {indicator.observationContext && <ObservationContext context={indicator.observationContext} />}
      <IndicatorAction indicator={indicator} profile={profile} />
      <div className="indicator__foot">
        <TrendIndicator trend={trend} text={trendText} />
        <Sparkline values={history} status={status} />
      </div>
      {showWhy && <WhySection id={indicator.id} status={indicator.missing || sample ? null : status} />}
      {limitKey && <LimitsInfo limitKey={limitKey} usual={usual} />}
    </article>
  );
}

export function IndicatorCardSkeleton() {
  return (
    <div className="card indicator" aria-hidden="true">
      <div className="indicator__top">
        <span className="skel" style={{ width: '45%', height: 16 }} />
        <span className="skel" style={{ width: 64, height: 22, borderRadius: 999 }} />
      </div>
      <span className="skel" style={{ width: '38%', height: 34, margin: '12px 0 10px' }} />
      <span className="skel" style={{ width: '70%', height: 14 }} />
    </div>
  );
}
