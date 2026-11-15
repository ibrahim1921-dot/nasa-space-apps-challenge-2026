/** Simple inline icons for the mission setting: station, spacecraft, surface. Decorative (aria-hidden). */
export default function EnvironmentIcon({ setting, size = 16 }) {
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    'aria-hidden': 'true',
    focusable: 'false',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'env-icon',
  };
  if (setting === 'spacecraft') {
    return (
      <svg {...common}>
        <path d="M12 2.5c3 2.2 4.5 5.6 4.5 9.5v4.5h-9V12c0-3.9 1.5-7.3 4.5-9.5z" />
        <circle cx="12" cy="10" r="1.8" />
        <path d="M7.5 13.5L5 17v2.5l2.5-1.5M16.5 13.5L19 17v2.5l-2.5-1.5M10 19.5l2 2 2-2" />
      </svg>
    );
  }
  if (setting === 'surface') {
    return (
      <svg {...common}>
        <path d="M2.5 19.5h19" />
        <path d="M5.5 19.5v-4a6.5 6.5 0 0113 0v4" />
        <path d="M10 19.5v-3h4v3" />
        <path d="M17 6.5l1.5-1.5M19.5 9h1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M12 3v6M12 15v6" />
      <rect x="2.5" y="10" width="5" height="4" rx="0.5" />
      <rect x="16.5" y="10" width="5" height="4" rx="0.5" />
      <path d="M7.5 12H9M15 12h1.5" />
    </svg>
  );
}
