const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { mountClient } = require('./serveClient');
const { compressResponses } = require('../middleware/compress');
const largeScript = '// ' + crypto.randomBytes(256 * 1024).toString('hex') + '\n';
const largeStyle = '/* ' + crypto.randomBytes(128 * 1024).toString('hex') + ' */\n';
const repeatedChunk = '// digital literacy delivery fixture\n'.repeat(2048);
const repeatedScript = repeatedChunk.repeat(32);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-static-delivery-'));
let server;
let base;

test.before(async () => {
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>DLAS fixture</title><div id="root">Application shell</div>');
  fs.writeFileSync(path.join(directory, 'favicon.svg'), '<svg></svg>');
  fs.writeFileSync(path.join(directory, 'assets', 'page-a1b2c3.js'), 'export const fixture = true;');
  fs.writeFileSync(path.join(directory, 'assets', 'large-page-a1b2c3.js'), largeScript);
  fs.writeFileSync(path.join(directory, 'assets', 'large-style-a1b2c3.css'), largeStyle);
  const app = express();
  app.use(compressResponses());
  app.get('/streamed-script.js', (req, res) => {
    res.type('application/javascript');
    res.setHeader('Content-Length', Buffer.byteLength(repeatedScript));
    Readable.from(Array(32).fill(repeatedChunk)).pipe(res);
  });
  app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));
  app.use('/api/*', (req, res) => res.status(404).json({ success: false }));
  mountClient(app, directory);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-static-delivery-')) throw Error('Unexpected fixture directory');
  fs.rmSync(resolved, { recursive: true, force: true });
});

for (const route of ['/forgot-password', '/reset-password?token=fixture-only-token', '/login', '/index.html']) {
  test(route.split('?')[0] + ' serves the app shell without storing an old entry document', async () => {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.match(body, /Application shell/);
    assert.doesNotMatch(body, /fixture-only-token/);
  });
}

for (const route of ['/assets/retired-page.js', '/assets/retired-style.css']) {
  test(route + ' returns an uncached real 404 instead of HTML', async () => {
    const response = await fetch(base + route);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.doesNotMatch(await response.text(), /doctype|Application shell/i);
  });
}

test('existing versioned JavaScript uses immutable long-lived caching while unhashed public assets stay short-lived', async () => {
  const response = await fetch(base + '/assets/page-a1b2c3.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(response.headers.get('cache-control'), /max-age=31536000/);
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal(await response.text(), 'export const fixture = true;');

  const publicAsset = await fetch(base + '/favicon.svg');
  assert.equal(publicAsset.status, 200);
  assert.match(publicAsset.headers.get('cache-control'), /max-age=3600/);
  assert.doesNotMatch(publicAsset.headers.get('cache-control'), /immutable/);
});

test('client delivery keeps API responses and unknown-API errors separate from the app shell', async () => {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'healthy');
  const missing = await fetch(base + '/api/missing');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  assert.equal((await missing.json()).success, false);
});

for (const [asset, expected] of [['large-page-a1b2c3.js', largeScript], ['large-style-a1b2c3.css', largeStyle]]) {
  for (const encoding of ['gzip', 'identity']) {
    test(asset + ' finishes without truncation when requesting ' + encoding, async () => {
      const response = await fetch(base + '/assets/' + asset, {
        headers: { 'Accept-Encoding': encoding },
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-encoding'), encoding === 'gzip' ? 'gzip' : null);
      assert.equal(await response.text(), expected);
    });
  }
}

test('a compressible script stream finishes when its producer is faster than gzip', async () => {
  const response = await fetch(base + '/streamed-script.js', {
    headers: { 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.equal(await response.text(), repeatedScript);
});
