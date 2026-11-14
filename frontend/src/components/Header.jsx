'use client';

import { MISSION_PROFILES, getProfile } from '../constants/mission.js';
import { formatTime } from '../utils/format.js';
import AccountMenu from './AccountMenu.jsx';
import OnboardStatus from './OnboardStatus.jsx';

const updatedText = (iso) =>
  new Date(iso).toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** @param {{ updatedAt?: string }} props  the signed-in person's newest reading time */
export default function Header({ crew, profileId, onProfileChange, updatedAt }) {
  const { data, loading, error, reload } = crew;
  const profile = getProfile(profileId);

  return (
    <header className="header">
      <div className="container header__inner">
        <h1 className="header__title">Crew health monitor</h1>

        <div className="header__profile">
          <label htmlFor="mission-profile" className="header__profile-label">
            Mission profile
          </label>
          <select
            id="mission-profile"
            className="input header__profile-select"
            value={profile.id}
            onChange={(e) => onProfileChange(e.target.value)}
            aria-describedby="mission-delay"
          >
            {MISSION_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p id="mission-delay" className="muted header__profile-delay">
            Signal delay to Earth: {profile.delayText}
          </p>
        </div>

        {loading && (
          <div className="header__crew" aria-hidden="true">
            <span className="skel" style={{ width: 160, height: 18 }} />
            <span className="skel" style={{ width: 120, height: 18 }} />
          </div>
        )}

        {!loading && error && (
          <div className="header__crew">
            <p className="muted">Crew details unavailable.</p>
            <button type="button" className="btn btn--secondary" onClick={reload}>
              Try again
            </button>
          </div>
        )}

        {!loading && data && (
          <div className="header__crew">
            <p className="header__signed-in">
              <span className="muted">Signed in as</span>{' '}
              <strong className="header__name">{data.name}</strong>
              <span className="muted"> · {data.role}</span>
            </p>
            <div className="header__meta">
              <p>
                Mission day <strong className="num">{data.missionDay}</strong> of {data.totalMissionDays}
              </p>
              {updatedAt && (
                <p className="muted">
                  Latest reading <time dateTime={updatedAt}>{updatedText(updatedAt)}</time>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="container header__onboard">
        <OnboardStatus profileId={profile.id} />
        <AccountMenu />
      </div>
    </header>
  );
}
