const ICONS = {
  up: <path d="M5 1.5 9 8.5H1z" />,
  down: <path d="M1 1.5h8L5 8.5z" />,
  flat: <rect x="1" y="4" width="8" height="2" rx="1" />,
};

/** Small triangle (decorative) plus the trend sentence, which carries the meaning. */
export default function TrendIndicator({ trend, text }) {
  return (
    <p className={`trend trend--${trend}`}>
      <svg className="trend__icon" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
        {ICONS[trend] ?? ICONS.flat}
      </svg>
      <span>{text}</span>
    </p>
  );
}
