import { STATUS_LABELS } from '../constants/status.js';
import StatusIcon from './StatusIcon.jsx';

/** Status word in its colour. `icon` swaps the dot for the shape-coded icon (check / exclamation / triangle). */
export default function StatusChip({ status, icon = false }) {
  return (
    <span className={`chip chip--${status}`}>
      {icon ? <StatusIcon status={status} size={14} /> : <span className="chip__dot" aria-hidden="true" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
