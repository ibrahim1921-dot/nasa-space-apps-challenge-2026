import { copy } from "@/content/ui";
import styles from './ui.module.css';
export default function SourceLabel({
  source = 'synthetic'
}) {
  const labels = {
    synthetic: copy.components_SourceLabel.synthetic,
    environment: copy.components_SourceLabel.environment,
    NASA: copy.components_SourceLabel.nasa,
    'general human data (PhysioNet)': copy.components_SourceLabel.general_human_data_physionet
  };
  return <small className={styles.source}>{copy.components_SourceLabel._source_}{labels[source] || source}</small>;
}
