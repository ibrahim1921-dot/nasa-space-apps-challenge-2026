'use client';

// Station environment: the crew app's Environment view (cabin CO₂, temperature and humidity tiles and
// the radiation chart), imported unchanged. It reads the bundled environment.json.

import Environment from '../../views/Environment.jsx';

export default function StationPanel() {
  return (
    <section aria-labelledby="gr-station-title" className="gr-station">
      <div className="gr-section-head">
        <h2 id="gr-station-title">Station</h2>
        <p className="gr-muted">Read only. Station measurements, not any crew member&apos;s personal exposure.</p>
      </div>
      <Environment />
    </section>
  );
}
