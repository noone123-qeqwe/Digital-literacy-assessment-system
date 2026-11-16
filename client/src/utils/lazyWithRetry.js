import { lazy } from 'react';

const RELOAD_KEY = 'dlas:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \S+ failed/i.test(message);
}

/**
 * Wrap React.lazy to automatically reload once when a deployment retires a
 * previously cached asset chunk, falling back to RouteErrorBoundary if retry fails.
 */
export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const module = await importer();
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        // Storage can be restricted in private browsing.
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        try {
          const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
          if (!lastReload || Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            window.location.reload();
            return new Promise(() => {});
          }
        } catch {
          // Ignore storage errors and surface the error to RouteErrorBoundary.
        }
      }
      throw error;
    }
  });
}

export default lazyWithRetry;
