/** Shape-coded status icon (check / exclamation / triangle). Decorative: always paired with the word. */
export default function StatusIcon({ status, size = 14 }) {
  const common = {
    className: 'status-icon',
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    'aria-hidden': 'true',
    focusable: 'false',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (status === 'alert') {
    return (
      <svg {...common}>
        <path d="M8 1.8 15 14H1z" />
        <path d="M8 6.3v3.6" />
        <circle cx="8" cy="11.9" r="0.4" fill="currentColor" />
      </svg>
    );
  }
  if (status === 'unknown' || !status) return <svg {...common}><circle cx="8" cy="8" r="6.6" /><path d="M5 8h6" /></svg>;
  if (status === 'watch') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.6" />
        <path d="M8 4.6v4.2" />
        <circle cx="8" cy="11.3" r="0.4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.6" />
      <path d="m5.2 8.2 1.9 1.9 3.8-4" />
    </svg>
  );
}
