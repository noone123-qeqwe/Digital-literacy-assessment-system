const { healthUrl, pingSite, DEFAULT_SITE_URL } = require('../scripts/ping-site');

const INTERVAL_MS = 60_000;

// This runs in the hosted server, independently of a browser or desktop app.
// It can check a running instance; it cannot restart its own suspended process.
function startWebsitePing({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  schedule = setInterval,
  cancel = clearInterval,
  now = () => new Date().toISOString(),
} = {}) {
  const state = {
    enabled: false,
    intervalSeconds: INTERVAL_MS / 1000,
    lastCheckedAt: null,
    lastHealthyAt: null,
    lastStatus: 'disabled',
  };
  let timer;
  let activeRequest;
  let stopped = false;
  const status = () => ({ ...state });
  const stop = () => {
    stopped = true;
    if (timer) cancel(timer);
    activeRequest?.abort();
    state.enabled = false;
  };

  if (env.DLAS_SELF_PING_ENABLED !== 'true') return { stop, status };
  let endpoint;
  try {
    endpoint = healthUrl(env.DLAS_SITE_URL || (env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${env.RENDER_EXTERNAL_HOSTNAME}`
      : env.CLIENT_URL || DEFAULT_SITE_URL));
  } catch {
    state.lastStatus = 'invalid_configuration';
    log('[DLAS self-ping] Not started: configure a valid HTTPS website origin.');
    return { stop, status };
  }

  state.enabled = true;
  state.lastStatus = 'waiting';
  const tick = async () => {
    if (stopped || activeRequest) return;
    const controller = new AbortController();
    activeRequest = controller;
    try {
      await pingSite(endpoint, {
        fetchImpl, attempts: 1, timeoutMs: 15_000, signal: controller.signal,
        log: () => {},
      });
      if (stopped) return;
      state.lastCheckedAt = now();
      state.lastHealthyAt = state.lastCheckedAt;
      state.lastStatus = 'healthy';
      log('[DLAS self-ping] Website responded with healthy HTTP 200.');
    } catch {
      if (stopped) return;
      state.lastCheckedAt = now();
      state.lastStatus = 'unavailable';
      log('[DLAS self-ping] Website did not return healthy HTTP 200; checking again next minute.');
    } finally {
      activeRequest = null;
    }
  };

  timer = schedule(() => { void tick(); }, INTERVAL_MS);
  timer.unref?.();
  log('[DLAS self-ping] Started: checking the website every 60 seconds while this server is running.');
  void tick();
  return { stop, status };
}

module.exports = { startWebsitePing };
