// Runs outside the web service so it can also reach a sleeping instance.
const DEFAULT_SITE_URL = 'https://masbate-colleges-digital-literacy.onrender.com';

function healthUrl(siteUrl = DEFAULT_SITE_URL) {
  let url;
  try { url = new URL(siteUrl); } catch { throw new Error('DLAS_SITE_URL must be your website’s complete HTTPS address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !['/', '/api/health'].includes(url.pathname)) {
    throw new Error('Use an HTTPS website address without credentials, query parameters, or a custom path.');
  }
  return new URL('/api/health', url.origin).href;
}

async function pingSite(siteUrl, {
  fetchImpl = fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = console.log,
  attempts = 4,
  timeoutMs = 20000,
  retryDelayMs = 8000,
} = {}) {
  const endpoint = healthUrl(siteUrl);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = performance.now();
    try {
      const response = await fetchImpl(endpoint, {
        headers: { Accept: 'application/json', 'User-Agent': 'DLAS-Website-Ping/1.0', 'Cache-Control': 'no-cache' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('The server is still starting or returned an unexpected page.');
      const body = await response.json();
      if (body?.status !== 'healthy' || body?.service !== 'Digital Literacy Assessment System API') throw new Error('The application health response is not ready.');
      const milliseconds = Math.round(performance.now() - started);
      log(`${new Date().toISOString()} Website is responding: HTTP 200 (${milliseconds} ms, attempt ${attempt}/${attempts}).`);
      return { endpoint, status: 200, milliseconds, attempts: attempt };
    } catch (error) {
      const message = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The request timed out while waiting for the website.' : error.message;
      log(`Ping ${attempt}/${attempts} did not receive application health: ${message}`);
      if (attempt === attempts) throw new Error('The website did not return a healthy application response after all attempts.');
      await wait(retryDelayMs);
    }
  }
  throw new Error('At least one ping attempt is required.');
}

if (require.main === module) {
  pingSite(process.env.DLAS_SITE_URL || DEFAULT_SITE_URL).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { healthUrl, pingSite, DEFAULT_SITE_URL };
