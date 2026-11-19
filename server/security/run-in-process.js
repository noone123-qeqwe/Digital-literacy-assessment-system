// Alternative transport for the existing integration suites on hosts without loopback networking.
// Routes, authentication, validation and persistence are unchanged; only HTTP socket transport is replaced.
const path = require('node:path');
const { inject } = require('./inject');
const permitted = new Set(['test_knowledge.js', 'test_quiz_completion.js', 'test_curriculum.js', 'test_bookmarks.js', 'test_mfa_policy.js']);
const target = process.argv[2];
if (!permitted.has(target)) throw new Error('Choose a supported integration suite.');
const originalFetch = global.fetch;
global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/api/')) return originalFetch(input, options);
  const response = await inject(require('../server').app, {
    method: options.method || 'GET', path: url.pathname + url.search, headers: options.headers || {}, rawBody: options.body,
  });
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  for (const cookie of response.cookies) headers.append('set-cookie', cookie);
  return new Response(response.status === 204 || response.status === 304 ? null : response.buffer, { status: response.status, headers });
};
require(path.join('..', target));
