const test = require('node:test');
const assert = require('node:assert/strict');
const { healthUrl, pingSite, DEFAULT_SITE_URL } = require('./ping-site');
const healthy = () => new Response(JSON.stringify({ status: 'healthy', service: 'Digital Literacy Assessment System API' }), { headers: { 'Content-Type': 'application/json' } });
const noWait = async () => {};
const noLog = () => {};

test('targets the deployed HTTPS health endpoint and normalizes a custom origin', () => {
  assert.equal(healthUrl(), `${DEFAULT_SITE_URL}/api/health`);
  assert.equal(healthUrl('https://assessment.example.edu/'), 'https://assessment.example.edu/api/health');
  assert.equal(healthUrl('https://assessment.example.edu/api/health'), 'https://assessment.example.edu/api/health');
});
test('rejects credentials, non-HTTPS addresses, query strings, and unrelated paths', () => {
  for (const url of ['bad url', 'http://example.edu', 'https://name:password@example.edu', 'https://example.edu/?token=private', 'https://example.edu/#private', 'https://example.edu/login']) assert.throws(() => healthUrl(url));
});
test('uses an uncached, bounded, unauthenticated GET and validates the application response', async () => {
  let calls = 0;
  const result = await pingSite(undefined, { log: noLog, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, healthUrl()); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert(options.signal instanceof AbortSignal);
    assert(!options.headers.Authorization && !options.headers.Cookie); return healthy();
  } });
  assert.equal(result.status, 200); assert.equal(calls, 1);
});
test('retries a cold-start response until the actual application is ready', async () => {
  const responses = [new Response('Starting', { status: 503 }), new Response('<html>Render is starting</html>', { headers: { 'Content-Type': 'text/html' } }), healthy()];
  const delays = [];
  const result = await pingSite(undefined, { log: noLog, wait: async (delay) => delays.push(delay), fetchImpl: async () => responses.shift() });
  assert.equal(result.attempts, 3); assert.deepEqual(delays, [8000, 8000]);
});
test('a timeout is retried without treating it as a successful ping', async () => {
  let calls = 0;
  const result = await pingSite(undefined, { log: noLog, wait: noWait, fetchImpl: async () => {
    if (++calls === 1) throw new DOMException('Timeout', 'TimeoutError'); return healthy();
  } });
  assert.equal(result.attempts, 2);
});
test('fails after bounded retries for malformed JSON or a false health page', async () => {
  let calls = 0;
  await assert.rejects(pingSite(undefined, { log: noLog, wait: noWait, fetchImpl: async () => {
    calls++; return new Response(calls % 2 ? '{bad json' : '{"status":"healthy"}', { headers: { 'Content-Type': 'application/json' } });
  } }), /after all attempts/);
  assert.equal(calls, 4);
});
