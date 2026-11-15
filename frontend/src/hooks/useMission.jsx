'use client';

// The mission environment for the whole app shell: one stored value (ahm.missionProfile.v1, the same key
// as before, so saved ids, the emergency guide and the ground console keep reading it), the profile,
// its environmentRules, and whether this person may change it. Only the CMO changes it from the header;
// More → Demo controls can always change it (for judges). This is a per-device demo setting: it is
// gated in the UI only, never stored on the server.

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_PROFILE_ID, PROFILES_BY_ID, getProfile } from '../constants/mission.js';
import { environmentRules } from '../lib/environmentRules.js';
import { useStoredSetting } from './useStoredSetting.js';

export const MISSION_KEY = 'ahm.missionProfile.v1';

const MissionContext = createContext(null);

export function MissionProvider({ canChange = false, children }) {
  const [profileId, setProfileId] = useStoredSetting(MISSION_KEY, DEFAULT_PROFILE_ID, (v) => typeof v === 'string' && v in PROFILES_BY_ID);
  const value = useMemo(() => {
    const profile = getProfile(profileId);
    const setProfile = (id) => {
      if (id in PROFILES_BY_ID) setProfileId(id);
    };
    return { profileId: profile.id, profile, rules: environmentRules(profile), canChange, setProfile };
  }, [profileId, canChange, setProfileId]);
  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

/** The mission environment; outside a provider, the default profile (read only). */
export function useMission() {
  const ctx = useContext(MissionContext);
  if (ctx) return ctx;
  const profile = getProfile(DEFAULT_PROFILE_ID);
  return { profileId: profile.id, profile, rules: environmentRules(profile), canChange: false, setProfile: () => {} };
}
