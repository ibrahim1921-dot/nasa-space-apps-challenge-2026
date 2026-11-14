export const endpoints = {
  health: '/actuator/health', crew: '/api/crew',
  summary: id => `/api/crew/${encodeURIComponent(id)}/summary`,
  readings: (id, indicator, days = 14) => `/api/crew/${encodeURIComponent(id)}/readings?indicator=${encodeURIComponent(indicator)}&days=${days}`,
  checkins: id => `/api/crew/${encodeURIComponent(id)}/checkins`,
  nights: subject => `/api/nights?subject=${encodeURIComponent(subject)}`,
  labs: analyte => `/api/labs?analyte=${encodeURIComponent(analyte)}`,
  radiation: '/api/environment/radiation',
};
