import { copy } from '@/content/ui';
export function valueText(value) {
  if (value == null) return '—';
  if (typeof value === 'object') return `${value.systolic ?? '—'}/${value.diastolic ?? '—'}`;
  return String(value);
}
export function dateText(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return copy.shared.unknown_time;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}
export function dayKey(value = new Date()) { return new Date(value).toISOString().slice(0, 10); }
