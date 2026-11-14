export function readStorage(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function cacheGet(path) { return readStorage(`chm:cache:${path}`); }
export function cachePut(path, data) { const entry = { data, timestamp: new Date().toISOString() }; writeStorage(`chm:cache:${path}`, entry); return entry; }
