const fs = require('node:fs');
const path = require('node:path');

function databaseConfiguration(env = process.env) {
  const url = String(env.TURSO_DATABASE_URL || '').trim();
  const token = String(env.TURSO_AUTH_TOKEN || '').trim();
  if (Boolean(url) !== Boolean(token)) throw new Error('Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. No local fallback is permitted.');
  const driver = env.DLAS_DATABASE_DRIVER || (url ? 'libsql' : 'sqlite');
  if (!['sqlite', 'libsql'].includes(driver)) throw new Error('DLAS_DATABASE_DRIVER must be sqlite or libsql.');
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('TURSO_DATABASE_URL must be a valid secure libSQL database URL.'); }
    const localTest = env.NODE_ENV === 'test' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    if ((!['libsql:', 'https:'].includes(parsed.protocol) && !localTest)
      || parsed.username || parsed.password || parsed.search || parsed.hash || driver !== 'libsql') {
      throw new Error('Use a secure libsql:// or https:// database URL and a separate authentication token.');
    }
    return { driver, remote: true, url, token, dbPath: null, isTurso: parsed.hostname.endsWith('.turso.io') };
  }
  if (env.RENDER && env.NODE_ENV === 'production' && env.DLAS_FREE_DEMO !== 'true') {
    throw new Error('Real accounts on Render require TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; ephemeral SQLite is not allowed.');
  }
  return { driver, remote: false, dbPath: path.resolve(env.DLAS_DB_PATH || path.join(__dirname, 'dlas.db')), isTurso: false };
}

function openDatabase(config = databaseConfiguration()) {
  if (config.dbPath) fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = config.driver === 'libsql'
    ? new (require('libsql'))(config.remote ? config.url : config.dbPath, config.remote ? { authToken: config.token } : undefined)
    : new (require('node:sqlite').DatabaseSync)(config.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!config.remote) {
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
  }
  // libSQL attaches query timing metadata to rows. Keep the API's existing row shape.
  if (config.driver === 'libsql') {
    const prepare = db.prepare.bind(db);
    const clean = (row) => {
      if (!row) return row;
      const { _metadata, ...values } = row;
      return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value instanceof ArrayBuffer ? Buffer.from(value) : value]));
    };
    db.prepare = (sql) => {
      const statement = prepare(sql);
      return {
        run: (...args) => statement.run(args),
        get: (...args) => clean(statement.get(args)),
        all: (...args) => statement.all(args).map(clean),
      };
    };
  }
  db.transaction = (fn) => function (...args) {
    db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn(...args);
      if (result && typeof result.then === 'function') throw new Error('Database transaction callbacks must be synchronous.');
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      // Preserve the original failure if a disconnected server also rejects rollback.
      try { db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  };
  return db;
}

module.exports = { databaseConfiguration, openDatabase };
