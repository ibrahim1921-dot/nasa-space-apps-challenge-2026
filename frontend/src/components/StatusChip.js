import { copy } from "@/content/ui";
import styles from './ui.module.css';
export const statusInfo = {
  normal: ['✓', copy.components_StatusChip.ok],
  watch: ['△', copy.components_StatusChip.watch],
  alert: ['!', copy.components_StatusChip.alert],
  no_data: ['—', copy.components_StatusChip.no_data]
};
export default function StatusChip({
  status = 'no_data'
}) {
  const [icon, word] = statusInfo[status] || statusInfo.no_data;
  return <span className={`${styles.chip} ${styles[status] || styles.no_data}`}><span aria-hidden="true">{icon}</span>{word}</span>;
}
