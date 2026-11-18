const SYNC_EVENT = 'dlas:certificate-sync';
const CHANNEL_NAME = 'dlas-certificate-sync';
const STORAGE_KEY = 'dlas:certificate-sync-ts';
const LOCK_CACHE_PREFIX = 'dlas:cert-lock-state:';

export function emitCertificateSync(detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'certificate-sync', timestamp: Date.now(), ...detail });
      channel.close();
    } catch {
      // Ignore BroadcastChannel errors in restricted contexts.
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage quota / private-mode errors.
    }
  }
}

export function subscribeCertificateSync(onSync) {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = (event) => onSync(event?.detail || {});
  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY) onSync({ source: 'storage' });
  };
  window.addEventListener(SYNC_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);

  let channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => onSync(event?.data || { source: 'broadcast' });
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(SYNC_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
  };
}

export function clearCertificateTransitionCache(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(`${LOCK_CACHE_PREFIX}${userId}`);
  } catch {
    // Ignore storage cleanup errors.
  }
}

// Tracks lock/unlock changes strictly to trigger visual unlock animations;
// unlock eligibility always comes from the database response.
export function detectNewlyUnlockedKeys(userId, items) {
  if (!userId || typeof sessionStorage === 'undefined' || !Array.isArray(items)) {
    return new Set();
  }
  const storageKey = `${LOCK_CACHE_PREFIX}${userId}`;
  let previous = null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) previous = JSON.parse(raw);
  } catch {
    previous = null;
  }

  const nextState = {};
  const newlyUnlocked = new Set();
  for (const item of items) {
    if (!item?.key) continue;
    const isUnlocked = Boolean(item.unlocked);
    nextState[item.key] = isUnlocked;
    if (previous && Object.prototype.hasOwnProperty.call(previous, item.key) && previous[item.key] === false && isUnlocked) {
      newlyUnlocked.add(item.key);
    }
  }

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(nextState));
  } catch {
    // Ignore storage errors.
  }

  return newlyUnlocked;
}
