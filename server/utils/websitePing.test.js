const test = require('node:test');
const assert = require('node:assert/strict');
const { startWebsitePing } = require('./websitePing');
const healthy = () => new Response(JSON.stringify({ status: 'healthy', service: 'Digital Literacy Assessment System API' }), { headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(overrides = {}) {
  let tick;
  const scheduleCalls = [];
  const canceled = [];
  const logs = [];
  const timer = { unref() { this.unreferenced = true; } };
  const service = startWebsitePing({
    env: { DLAS_SELF_PING_ENABLED: 'true', RENDER_EXTERNAL_HOSTNAME: 'assessment.example.edu' },
    fetchImpl: async () => healthy(),
    log: (message) => logs.push(message),
    schedule: (callback, interval) => { tick = callback; scheduleCalls.push(interval); return timer; },
    cancel: (handle) => canceled.push(handle),
    ...overrides,
  });
  return { service, tick: () => tick?.(), scheduleCalls, canceled, logs, timer };
}

test('server pings are opt-in and disabled without scheduling or network requests', () => {
  let calls = 0;
  const f = fixture({ env: {}, fetchImpl: async () => { calls++; return healthy(); } });
  assert.equal(f.service.status().enabled, false);
  assert.equal(f.service.status().lastStatus, 'disabled');
  assert.equal(calls, 0);
  assert.deepEqual(f.scheduleCalls, []);
  f.service.stop();
});

test('checks the hosted HTTPS health endpoint immediately and every minute without credentials', async () => {
  let calls = 0;
  const f = fixture({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://assessment.example.edu/api/health');
    assert.ok(!options.method || options.method === 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return healthy();
  } });
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(f.scheduleCalls, [60_000]);
  assert.equal(f.timer.unreferenced, true);
  assert.equal(f.service.status().intervalSeconds, 60);
  assert.equal(f.service.status().lastStatus, 'healthy');
  assert.ok(f.service.status().lastHealthyAt);
  f.tick(); await flush();
  assert.equal(calls, 2);
  f.service.stop();
});

test('configured URL takes precedence and status never exposes the endpoint', async () => {
  let destination;
  const f = fixture({ env: { DLAS_SELF_PING_ENABLED: 'true', DLAS_SITE_URL: 'https://public.example.edu', RENDER_EXTERNAL_HOSTNAME: 'other.example.edu' }, fetchImpl: async (url) => { destination = url; return healthy(); } });
  await flush();
  assert.equal(destination, 'https://public.example.edu/api/health');
  assert.ok(!JSON.stringify(f.service.status()).includes('example.edu'));
  const snapshot = f.service.status(); snapshot.enabled = false;
  assert.equal(f.service.status().enabled, true);
  f.service.stop();
});

test('invalid or credential-bearing configuration does not start and is not echoed in logs', () => {
  for (const url of ['http://example.edu', 'https://name:private-value@example.edu', 'https://example.edu/?token=private-value', 'https://example.edu/login']) {
    const f = fixture({ env: { DLAS_SELF_PING_ENABLED: 'true', DLAS_SITE_URL: url } });
    assert.equal(f.service.status().enabled, false);
    assert.equal(f.service.status().lastStatus, 'invalid_configuration');
    assert.deepEqual(f.scheduleCalls, []);
    assert.ok(!f.logs.join(' ').includes('private-value'));
  }
});

test('network failures make one request per tick and later checks can recover', async () => {
  let calls = 0;
  let time = '2026-11-16T08:00:00.000Z';
  const f = fixture({ now: () => time, fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new Error('Private provider error');
    return healthy();
  } });
  await flush();
  assert.equal(calls, 1);
  assert.equal(f.service.status().lastStatus, 'unavailable');
  assert.equal(f.service.status().lastHealthyAt, null);
  assert.ok(!f.logs.join(' ').includes('Private provider error'));
  time = '2026-11-16T08:01:00.000Z'; f.tick(); await flush();
  assert.equal(calls, 2);
  assert.equal(f.service.status().lastStatus, 'healthy');
  assert.equal(f.service.status().lastCheckedAt, time);
  assert.equal(f.service.status().lastHealthyAt, time);
  f.service.stop();
});

test('false health pages, redirects, malformed JSON and timeouts are failures', async () => {
  for (const fetchImpl of [
    async () => new Response('Starting', { status: 503 }),
    async () => new Response('Redirect', { status: 302 }),
    async () => new Response('<html>Loading</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => new Response('{bad JSON', { headers: { 'Content-Type': 'application/json' } }),
    async () => new Response('{"status":"healthy","service":"Different app"}', { headers: { 'Content-Type': 'application/json' } }),
    async () => { throw new DOMException('Timed out', 'TimeoutError'); },
  ]) {
    const f = fixture({ fetchImpl }); await flush();
    assert.equal(f.service.status().lastStatus, 'unavailable');
    f.service.stop();
  }
});

test('pending requests do not overlap and shutdown cancels the request and timer', async () => {
  let calls = 0;
  let signal;
  const f = fixture({ fetchImpl: async (url, options) => {
    calls++; signal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  f.tick(); f.tick();
  assert.equal(calls, 1);
  const before = [...f.logs];
  f.service.stop(); await flush();
  assert.equal(signal.aborted, true);
  assert.deepEqual(f.canceled, [f.timer]);
  assert.equal(f.service.status().enabled, false);
  f.tick(); await flush();
  assert.equal(calls, 1);
  assert.deepEqual(f.logs, before);
});
