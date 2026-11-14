import { copy } from "@/content/ui";
import styles from './ui.module.css';
export default function Sparkline({
  readings = []
}) {
  const nums = readings.map(r => typeof r.value === 'object' && r.value ? r.value.systolic : r.value);
  const valid = nums.filter(v => typeof v === 'number');
  if (valid.length < 2) return <p className="muted">{copy.components_Sparkline.no_trend_available}</p>;
  const min = Math.min(...valid) - 1;
  const span = Math.max(...valid) - min + 1;
  const points = nums.map((v, i) => v == null ? null : `${i / Math.max(1, nums.length - 1) * 200},${38 - (v - min) / span * 32}`);
  const segments = [];
  let current = [];
  for (const p of points) {
    if (p) current.push(p);else {
      segments.push(current);
      current = [];
    }
  }
  segments.push(current);
  return <svg className={styles.spark} viewBox="0 0 200 42" role="img" aria-label={copy.components_Sparkline.recent_readings_sparkline}>{segments.map((segment, i) => <polyline key={i} points={segment.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />)}</svg>;
}
