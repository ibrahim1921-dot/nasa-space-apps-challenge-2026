export const STATUS_LABELS = {
  normal: 'Normal',
  watch: 'Watch',
  alert: 'Alert',
};

// Lower number = more severe; used to sort indicator lists alert → watch → normal.
export const STATUS_SEVERITY = { alert: 0, watch: 1, normal: 2 };

export const bySeverity = (a, b) => (STATUS_SEVERITY[a.status] ?? 3) - (STATUS_SEVERITY[b.status] ?? 3);
