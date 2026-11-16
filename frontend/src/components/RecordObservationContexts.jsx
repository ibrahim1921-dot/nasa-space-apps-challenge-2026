import ObservationContext from './ObservationContext.jsx';
import { contextForRecord, indicatorCode } from '../lib/observationContext.js';
import { VITALS_ROWS, formatRowValue } from '../lib/vitalsCheckin.js';

export default function RecordObservationContexts({ record }) {
  if (record?.kind !== 'daily_vitals' || !record.payload?.reading) return null;
  const rows = VITALS_ROWS.filter((row) => row.parts.every((key) => typeof record.payload.reading[key] === 'number'));
  return <details className="record-observation-contexts">
    <summary>Measurement context</summary>
    {rows.map((row) => {
      const result = record.payload.result?.indicators?.[row.id];
      return <div key={row.id} className="record-observation-contexts__item">
        <strong>{row.id === 'heart_rate' ? 'Heart rate' : row.name}{result ? `: ${formatRowValue(result)} ${row.unit}` : ''}</strong>
        <ObservationContext context={contextForRecord(record, indicatorCode(row.id))} />
      </div>;
    })}
  </details>;
}
