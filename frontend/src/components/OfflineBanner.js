import { copy } from "@/content/ui";
import { dateText } from '@/lib/format';
import styles from './ui.module.css';
export default function OfflineBanner({
  state
}) {
  if (state?.offline) return <div role="status" className={styles.banner}>{copy.components_OfflineBanner.onboard_server_unreachable_showing_your_last}{dateText(state.timestamp)}{copy.components_OfflineBanner.label}</div>;
  if (state?.error) return <div role="alert" className={styles.banner}>{state.error}</div>;
  return null;
}
