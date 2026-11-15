import { notifyRecordsChanged } from './standTestStore.js';

// One-time cleanup of the admin's old local preview data. Other crew records are preserved.
export function clearAdminHealthOnce(crewId, storage) {
  if (!crewId || !storage) return false;
  const marker = `ahm.adminHealthReset.v1:${crewId}`;
  try {
    if (storage.getItem(marker) === 'done') return false;
    const updates = ['ahm.dailyVitals.v1', 'ahm.wellnessCheckins.v1', 'ahm.standTests.v1'].map((key) => {
      const raw = storage.getItem(key);
      const records = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(records)) throw new Error('Invalid saved health records');
      return [key, records.filter((record) => record?.crew_id !== crewId)];
    });
    for (const [key, records] of updates) storage.setItem(key, JSON.stringify(records));
    storage.setItem(marker, 'done');
    notifyRecordsChanged();
    return true;
  } catch { return false; }
}
