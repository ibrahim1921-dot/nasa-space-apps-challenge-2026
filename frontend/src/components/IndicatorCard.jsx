import StatusChip from './StatusChip.jsx';
import TrendIndicator from './TrendIndicator.jsx';
import Sparkline from './Sparkline.jsx';
import LimitsInfo from './LimitsInfo.jsx';
import ActionCard, { CRISIS_STEPS } from './ActionCard.jsx';
import ObservationContext from './ObservationContext.jsx';

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

export default function IndicatorCard({ indicator, profile }) {
  const { name, value, unit, status, trend, trendText, history, limitKey, sample, usual } = indicator;
  if (indicator.missing) return <article className="card indicator"><h3 className="indicator__name">{name}</h3><p className="muted">No recorded data</p></article>;
  return (
    <article className="card indicator">
      <div className="indicator__top">
        <h3 className="indicator__name">{name}</h3>
        <StatusChip status={status} />
      </div>
      {sample ? (
        <p className="indicator__sample">Sample</p>
      ) : (
        indicator.sourceNote && <p className="indicator__source">{indicator.sourceNote}</p>
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
