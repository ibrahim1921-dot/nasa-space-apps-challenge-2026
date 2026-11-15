'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHealthData } from '../hooks/useHealthData.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { getRegionIndicators } from '../services/healthService.js';
import { REGIONS_BY_ID } from '../constants/regions.js';
import { bySeverity } from '../constants/status.js';
import StatusChip from './StatusChip.jsx';
import TrendIndicator from './TrendIndicator.jsx';
import Sparkline from './Sparkline.jsx';
import ErrorPanel from './ErrorPanel.jsx';
import LimitsInfo from './LimitsInfo.jsx';
import { IndicatorAction, StatusOrMissing } from './IndicatorCard.jsx';
import ProvenanceChip from './ProvenanceChip.jsx';
import { WhyButton } from './WhyItMatters.jsx';
import { applyVitals } from '../lib/vitalsDashboard.js';
import { applyReaction } from '../lib/personDashboard.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function summarize(items) {
  const flagged = items.filter((i) => i.status !== 'normal').length;
  if (flagged === 0) return `All ${items.length} indicators are in the normal range`;
  return `${flagged} of ${items.length} indicators need attention`;
}

function IndicatorRow({ indicator, profile, onOpenWhy }) {
  const { name, value, unit, status, trend, trendText, history, limitKey, sample, usual } = indicator;
  return (
    <li className="row">
      <div className="row__top">
        <h3 className="row__name">{name}</h3>
        <span className="row__chips">
          <WhyButton id={indicator.id} name={name} onOpen={onOpenWhy} />
          <StatusOrMissing indicator={indicator} />
        </span>
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
      <IndicatorAction indicator={indicator} profile={profile} />
      <div className="row__mid">
        <p className="row__value">
          <span className="num">{value}</span>
          {unit && <span className="indicator__unit">{unit}</span>}
        </p>
        <Sparkline values={history} status={status} />
      </div>
      <TrendIndicator trend={trend} text={trendText} />
      {limitKey && <LimitsInfo limitKey={limitKey} usual={usual} />}
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="row" aria-hidden="true">
      <div className="row__top">
        <span className="skel" style={{ width: '50%', height: 16 }} />
        <span className="skel" style={{ width: 64, height: 22, borderRadius: 999 }} />
      </div>
      <span className="skel" style={{ width: '30%', height: 26, margin: '8px 0' }} />
      <span className="skel" style={{ width: '60%', height: 14 }} />
    </li>
  );
}

/**
 * Modal drawer listing every indicator for one region, most severe first.
 * Mounted only while open, so each open starts with a skeleton until its own data arrives.
 */
export default function RegionDrawer({
  regionId,
  status,
  onClose,
  getReturnTarget,
  onStartStandTest,
  profile,
  latestVitals = null,
  crewRecord = null,
  usual = null,
  personal = {}, // the person's own main-dashboard cards by id; they replace the matching drawer rows
  pinned = [], // the person's own cards shown first (e.g. sleep and mood in the head drawer)
  vitalIds = [], // readings that are also on the Vitals page: their "Why?" opens it there
  onOpenVital = null, // (id) => open that reading on Vitals
}) {
  const region = REGIONS_BY_ID[regionId];
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const { data, loading, error, reload } = useHealthData(() => getRegionIndicators(regionId), [regionId]);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const items = data
    ? [
        ...pinned,
        ...data
          .filter((i) => !pinnedIds.has(i.id))
          .map((i) => personal[i.id] ?? applyReaction(applyVitals(i, latestVitals, usual), crewRecord))
          .sort(bySeverity),
      ]
    : [];

  // Play the slide-out first, unless motion is reduced (then there is no animation to wait for).
  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) onClose();
    else setClosing(true);
  }, [onClose]);

  useFocusTrap(panelRef, { onEscape: requestClose, getReturnTarget });

  // Stop the page behind from scrolling while the drawer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="drawer-root">
      <div className={`drawer-backdrop${closing ? ' is-closing' : ''}`} onClick={requestClose} />
      <div
        ref={panelRef}
        className={`drawer${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === panelRef.current) onClose();
        }}
      >
        <div className="drawer__head">
          <div className="drawer__heading">
            <h2 id="drawer-title" className="drawer__title">
              {region.title}
            </h2>
            {status && <StatusChip status={status} />}
          </div>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="drawer__summary muted" aria-live="polite">
          {loading ? 'Loading indicators…' : error ? '' : summarize(items)}
        </p>

        <div className="drawer__body" tabIndex={0} role="region" aria-label={`${region.title} indicators`}>
          {loading && (
            <ul className="rows" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <RowSkeleton key={i} />
              ))}
            </ul>
          )}
          {!loading && error && <ErrorPanel onRetry={reload} />}
          {!loading && !error && (
            <ul className="rows">
              {items.map((indicator) => (
                <IndicatorRow
                  key={indicator.id}
                  indicator={indicator}
                  profile={profile}
                  onOpenWhy={
                    onOpenVital && vitalIds.includes(indicator.id)
                      ? (id) => {
                          onClose();
                          onOpenVital(id);
                        }
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {onStartStandTest && (
          <div className="drawer__foot">
            <p className="muted">Check how your heart rate and BP respond when you stand up.</p>
            <button type="button" className="btn btn--primary" onClick={onStartStandTest}>
              Run a stand test
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
