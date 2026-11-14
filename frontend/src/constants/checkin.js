export const ISOLATION_OPTIONS = [
  { value: '1', label: '1', srLabel: 'Not at all' },
  { value: '2', label: '2', srLabel: 'Slightly' },
  { value: '3', label: '3', srLabel: 'Somewhat' },
  { value: '4', label: '4', srLabel: 'Quite isolated' },
  { value: '5', label: '5', srLabel: 'Very isolated' },
];

export const WORKLOAD_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Normal' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'overloaded', label: 'Overloaded' },
];

export const FAMILY_CALL_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '1-3-days', label: '1–3 days' },
  { value: '4-7-days', label: '4–7 days' },
  { value: 'over-a-week', label: 'Over a week' },
];

export const TENSION_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Human-readable label for a stored option value. */
export function labelFor(options, value) {
  const option = options.find((o) => o.value === String(value));
  return option ? option.srLabel ?? option.label : '';
}
