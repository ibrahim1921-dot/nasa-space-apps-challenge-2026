'use client';

import { useEffect, useRef, useState } from 'react';
import StatusChip from './StatusChip.jsx';
import ActionCard from './ActionCard.jsx';
import LimitsInfo from './LimitsInfo.jsx';
import SourceLabel from './SourceLabel.jsx';
import SyncBadge, { useFreshRecord } from './SyncBadge.jsx';
import { formatRowValue } from '../lib/vitalsCheckin.js';
import { SCORED_LABEL } from '../lib/scoring.js';
import { provenanceOf, rowProvenance } from '../lib/provenance.js';
import ProvenanceChip from './ProvenanceChip.jsx';
import { missingText } from '../lib/vitalsDashboard.js';
import RecordObservationContexts from './RecordObservationContexts.jsx';

/** Which check fired, as a short tag before each reason. */
function checkTag(reason) {
  if (/ line \(/.test(reason)) return 'Limit';
  if (/drifted/.test(reason)) return 'Trend';
  return 'Your usual';
}

function ResultRow({ row, profile, chip }) {
  const flagged = row.status === 'watch' || row.status === 'alert';
  // Alert rows open their action card straight away; watch rows open on request.
  const [open, setOpen] = useState(row.status === 'alert' && !row.crisis);
  const actionId = `vitals-action-${row.id}`;
  return (
    <li className={`vrow vrow--${row.status}`}>
      <div className="vrow__head">
        <h4 className="vrow__name">{row.name}</h4>
        <StatusChip status={row.status} icon />
      </div>
      <p className="vrow__value">
        <span className="num">{formatRowValue(row)}</span>
        <span className="vrow__unit">{row.unit}</span>
      </p>
      {chip && (
        <p className="vrow__prov">
          <ProvenanceChip chip={chip} />
        </p>
      )}
      {row.reasons.length > 0 ? (
        <ul className="vrow__reasons">
          {row.reasons.map((r) => (
            <li key={r}>
              <span className="vrow__tag">{checkTag(r)}</span>
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted vrow__ok">Within the limits and your usual range.</p>
      )}
      {row.usual && (
        <p className="vrow__usual">
          Your usual: <span className="num">{row.usual.text}</span> (last {row.usual.days} days)
        </p>
      )}
      {flagged && row.action && !row.crisis && (
        <>
          <button
            type="button"
            className="btn btn--secondary vrow__toggle"
            aria-expanded={open}
            aria-controls={actionId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide what to do' : 'What to do'}
          </button>
          <div id={actionId} hidden={!open}>
            <ActionCard
              status={row.action.status}
              profile={profile}
              steps={row.action.steps}
              urgent={row.action.urgent}
              titleId={`${actionId}-title`}
            />
          </div>
        </>
      )}
      <LimitsInfo limitKey={row.limit_key} usual={row.usual} />
    </li>
  );
}

const usesSensors = (record) => Object.values(provenanceOf(record)?.fields ?? {}).includes('sensor');
const readingsSource = (record) => {
  const fields = Object.values(provenanceOf(record)?.fields ?? {});
  if (fields.includes('cmo_exam')) return fields.includes('sensor') ? 'measured in a CMO exam, the rest from simulated sensors' : 'measured in a CMO exam';
  return plainSource(record);
};
const plainSource = (record) =>
  usesSensors(record) ?'simulated sensors confirmed on this device, the rest entered by hand' : 'entered on this device';

/**
 * Result of a daily vitals check-in: crisis card first (if any), then one row per indicator.
 * @param {{ result: object, profile: object, stored: boolean, crewName?: string, onDone: () => void }} props
 */
export default function CheckinResult({ record, result, profile, stored, crewName, onDone, chipRecord = record, attribution = null, children = null }) {
  const headingRef = useRef(null);
  const fresh = useFreshRecord(record);
  const scoredOn = fresh?.scored_on ?? result.scored_on ?? 'device';
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const rows = result.order.map((id) => result.indicators[id]);
  const crisisCard = result.crisis ? result.action : null;
  const dayCard = !result.crisis ? result.action : null;

  return (
    <div className="vresult">
      <div className="vresult__head">
        <h3 ref={headingRef} tabIndex={-1} className="checkin__title">
          Today’s readings{crewName ? ` for ${crewName}` : ''}
        </h3>
        <StatusChip status={result.status} icon />
      </div>
      {attribution && <p className="vresult__by">{attribution}</p>}
      {record && stored && (
        <p className="vresult__sync">
          <SyncBadge record={record} showScoredOn />
        </p>
      )}

      {crisisCard && (
        <ActionCard
          status="alert"
          profile={profile}
          urgent={crisisCard.urgent}
          steps={crisisCard.steps}
          titleId="vitals-crisis-title"
          source="Hypertensive crisis line: American Heart Association · steps: app guidance"
        />
      )}

      <p className="vresult__summary">{result.summary}</p>

      {dayCard && (
        <ActionCard
          status={dayCard.status}
          profile={profile}
          steps={dayCard.steps}
          titleId="vitals-day-title"
          source="Steps for today’s flagged readings (app guidance)"
        />
      )}

      <ul className="vresult__rows" aria-label="Readings">
        {rows.map((row) => (
          <ResultRow key={row.id} row={row} profile={profile} chip={rowProvenance(chipRecord, row.id)} />
        ))}
      </ul>
      {result.missing?.length > 0 && (
        <ul className="vresult__missing" aria-label="Not measured today">
          {result.missing.map((id) => (
            <li key={id} className="chip chip--muted">
              {missingText(chipRecord, id)}
            </li>
          ))}
        </ul>
      )}
      <RecordObservationContexts record={record} />
      {children}

      <p className="muted vresult__note">
        Each reading is checked two ways: against the published or team-set limits, and against your own last{' '}
        {result.baseline_window_days} days. The status is the worse of the two.{' '}
        {stored
          ? 'Check-in saved on this device.'
          : 'This browser could not save the result, so it will be gone after a reload.'}
        {fresh?.server_differs &&
          ' Updated with your latest readings.'}
      </p>

      <div className="checkin__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={onDone}>
          Back to dashboard
        </button>
      </div>
      <SourceLabel
        source={`Readings: ${readingsSource(chipRecord)} · Baseline: ${result.history_source} · ${SCORED_LABEL[scoredOn]}`}
        simulated={usesSensors(chipRecord)}
      />
    </div>
  );
}
