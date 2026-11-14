export const disclaimer = 'Prototype for decision support. Not a medical device and not a diagnosis.';
export const sources = [
  { label: 'General human data (PhysioNet)', name: 'Multi-Night Heart Rate and Accelerometry v1.0.1', use: '47 healthy adults on Earth, 253 nights; sleep baseline context', terms: 'ODC-By 1.0, cite it', url: 'https://physionet.org/content/bidsleep-dataset/1.0.1/' },
  { label: 'NASA', name: 'Inspiration4 OSD-575 / OSD-569', use: '4 civilian crew, 7 bloodwork draws', terms: 'NASA open data', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575', extra: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' },
  { label: 'Environment', name: 'NASA RR-1 Environmental Data', use: 'ISS station radiation and cabin context; not personal dose', terms: 'NASA open data', url: 'https://osdr.nasa.gov/' },
  { label: 'Synthetic', name: 'Demo fixtures', use: 'Fictional crew and demonstration readings', terms: 'Team-generated', url: null },
];
export const resources = [
  ['5 Hazards of Human Spaceflight', 'https://www.nasa.gov/hrp/hazards/'],
  ['Risks of Human Spaceflight', 'https://www.nasa.gov/hrp/risks/'],
  ['Ongoing HRP Research in Space', 'https://www.nasa.gov/hrp/ongoing-hrp-research/'],
  ['CSA: Monitoring Radiation for Astronaut Health', 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp'],
];
