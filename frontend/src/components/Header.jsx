'use client';

import { getProfile } from '../constants/mission.js';
import { formatTime } from '../utils/format.js';
import AccountMenu from './AccountMenu.jsx';
import OnboardStatus from './OnboardStatus.jsx';
import EmergencyButton from './EmergencyButton.jsx';
import EnvironmentChip from './EnvironmentChip.jsx';

const updatedText = (iso) =>
  new Date(iso).toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * @param {{ updatedAt?: string, viewMenu?: object }} props  updatedAt: the signed-in person's newest reading time; viewMenu: CMO only, see AccountMenu
 * The mission environment is the chip next to the account menu (components/EnvironmentChip.jsx); only the CMO changes it there.
 * reminderBell: the reminders bell (components/ReminderBell.jsx), shown just before the environment chip.
 */
export default function Header({ crew, profileId, updatedAt, missionDay = null, viewMenu = null, reminderBell = null }) {
  const { data, loading, error, reload } = crew;
  const profile = getProfile(profileId);

  return (
    <header className="header">
      <div className="container header__inner">
        <div className="header__brand">
          <h1 className="header__title">Crew health monitor</h1>
          <EmergencyButton />
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
                Mission day <strong className="num">{missionDay ?? data.missionDay}</strong> of {data.totalMissionDays}
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
        <div className="header__controls">
          {reminderBell}
          <EnvironmentChip />
          <AccountMenu viewMenu={viewMenu} />
        </div>
      </div>
    </header>
  );
}
