import DeviceIcon from './DeviceIcon.jsx';

/**
 * Where a value came from, as icon + words (never colour alone):
 *   { kind: 'sensor', device, deviceLabel, simulated } → "Sensor · shirt" + "Simulated"
 *   { kind: 'manual', by }                             → "Entered by Maya"
 *   { kind: 'exam', by, role }                         → "Exam by Lena (CMO)"
 */
export default function ProvenanceChip({ chip }) {
  if (!chip) return null;
  if (chip.kind === 'sensor') {
    return (
      <span className="prov">
        <span className="chip chip--muted prov__chip">
          <DeviceIcon device={chip.device ?? 'shirt'} size={14} />
          Sensor{chip.deviceLabel ? ` · ${chip.deviceLabel}` : ''}
        </span>
        {chip.simulated && <span className="prov__sim">Simulated</span>}
      </span>
    );
  }
  if (chip.kind === 'exam') {
    return (
      <span className="prov">
        <span className="chip chip--muted prov__chip prov__chip--exam">
          <DeviceIcon device="exam" size={14} />
          Exam by {chip.by} ({chip.role ?? 'CMO'})
        </span>
      </span>
    );
  }
  return (
    <span className="prov">
      <span className="chip chip--muted prov__chip">
        <DeviceIcon device="manual" size={14} />
        Entered by {chip.by}
      </span>
    </span>
  );
}

/** Several chips in a row (CMO cards and feed). */
export function ProvenanceChips({ chips }) {
  if (!chips?.length) return null;
  return (
    <span className="prov-list">
      {chips.map((c, i) => (
        <ProvenanceChip key={`${c.kind}-${i}`} chip={c} />
      ))}
    </span>
  );
}
