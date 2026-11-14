/** 7-point trend line in the status colour. No axes; the trend text carries the meaning. */
export default function Sparkline({ values, status, width = 84, height = 28 }) {
  const nums = (values ?? []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return null;

  const pad = 3;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const step = (width - pad * 2) / (nums.length - 1);
  const points = nums.map((v, i) => [
    pad + i * step,
    span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      className={`spark spark--${status}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={points.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')} />
      <circle cx={lastX} cy={lastY} r="2.5" />
    </svg>
  );
}
