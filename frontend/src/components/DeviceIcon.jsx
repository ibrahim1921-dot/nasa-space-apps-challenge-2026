/** Small line icons for the worn devices, plus a pencil for values typed by hand. Decorative: the word next to it carries the meaning. */
const PATHS = {
  // shirt (Bio-Monitor smart shirt)
  shirt: <path d="M5.5 2 2 4.5l1.6 3 1.4-.8V14h6V6.7l1.4.8 1.6-3L10.5 2C10 3.2 9.1 3.8 8 3.8S6 3.2 5.5 2Z" />,
  // drop (glucose monitor)
  cgm: <path d="M8 1.8S3.5 7 3.5 10a4.5 4.5 0 0 0 9 0C12.5 7 8 1.8 8 1.8Z" />,
  // thermometer (core-temperature headband)
  headband: (
    <>
      <path d="M6.5 9.3V3a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0Z" />
      <path d="M8 6v5" />
    </>
  ),
  // moon (sleep, wrist actigraph)
  actigraph: <path d="M12.8 10.2A5.5 5.5 0 0 1 5.8 3.2a5.5 5.5 0 1 0 7 7Z" />,
  // pencil (entered by hand)
  manual: <path d="m10.5 2.5 3 3L6 13H3v-3l7.5-7.5Z" />,
  // stethoscope (measured in a CMO exam)
  exam: (
    <>
      <path d="M3.5 2v3.5a3 3 0 0 0 6 0V2" />
      <path d="M6.5 8.5V10a3 3 0 0 0 6 0V8.8" />
      <circle cx="12.5" cy="7.3" r="1.5" />
    </>
  ),
};

export default function DeviceIcon({ device, size = 16 }) {
  const path = PATHS[device];
  if (!path) return null;
  return (
    <svg
      className="device-icon"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}
