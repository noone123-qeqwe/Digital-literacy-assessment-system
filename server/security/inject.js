// Exercise the actual Express middleware and routes without opening a network port.
const http = require('node:http');
const { Duplex } = require('node:stream');

function inject(app, { method = 'GET', path = '/', headers = {}, body, rawBody, ip = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    Object.defineProperty(socket, 'remoteAddress', { value: ip });
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = path;
    req.httpVersion = '1.1';
    // A real HTTP parser marks the complete request before asynchronous handlers finish.
    // Without this, IncomingMessage treats its in-memory socket as an aborted upload.
    req.complete = true;
    const data = rawBody !== undefined ? Buffer.from(rawBody) : body === undefined ? null : Buffer.from(JSON.stringify(body));
    req.headers = { host: 'security-test.local', connection: 'close', 'accept-encoding': 'identity', ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])) };
    if (data) {
      req.headers['content-type'] ||= 'application/json';
      req.headers['content-length'] = String(data.length);
    }
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    // The HTTP server normally forwards socket backpressure to ServerResponse.
    socket.on('drain', () => res.emit('drain'));
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`In-process request timed out: ${method} ${path}`)); }, 15000);
    res.on('error', reject);
    res.on('finish', () => {
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks);
        const separator = raw.indexOf('\r\n\r\n');
        const head = raw.subarray(0, separator).toString();
        let buffer = raw.subarray(separator + 4);
        const fields = head.split('\r\n');
        const status = Number(fields.shift().split(' ')[1]);
        const responseHeaders = {};
        const cookies = [];
        for (const field of fields) {
          const index = field.indexOf(':');
          const name = field.slice(0, index).toLowerCase(), value = field.slice(index + 1).trim();
          if (name === 'set-cookie') cookies.push(value);
          responseHeaders[name] = value;
        }
        if (responseHeaders['transfer-encoding'] === 'chunked') {
          const decoded = [];
          for (let offset = 0; offset < buffer.length;) {
            const end = buffer.indexOf('\r\n', offset);
            const size = Number.parseInt(buffer.subarray(offset, end).toString(), 16);
            if (!size) break;
            decoded.push(buffer.subarray(end + 2, end + 2 + size));
            offset = end + 4 + size;
          }
          buffer = Buffer.concat(decoded);
        }
        const text = buffer.toString();
        let json;
        if (responseHeaders['content-type']?.includes('application/json')) json = JSON.parse(text);
        resolve({ status, headers: responseHeaders, cookies, text, json, buffer });
      } catch (error) { reject(error); }
      finally { socket.destroy(); }
    });
    app.handle(req, res);
    if (data) req.push(data);
    req.push(null);
  });
}

module.exports = { inject };
