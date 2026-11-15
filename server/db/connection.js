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

function cleanLibsqlRow(row) {
  if (!row) return row;
  const { _metadata, ...values } = row;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value instanceof ArrayBuffer ? Buffer.from(value) : value]));
}

function openRemoteDatabase(createClient) {
  let closed = false;
  let transactionConnection = null;

  // A remote native connection owns an expiring server-side stream. Release it
  // after each operation, keeping it only for a synchronous transaction. Never
  // replay writes: a lost response can still represent a committed operation.
  function useConnection(operation) {
    if (closed) throw new Error('Database is closed.');
    if (transactionConnection) return operation(transactionConnection);
    const connection = createClient();
    try {
      connection.exec('PRAGMA foreign_keys = ON;');
      return operation(connection);
    } finally {
      connection.close();
    }
  }

  return {
    get inTransaction() { return transactionConnection !== null; },
    exec(sql) {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) throw new Error('Use database.transaction() for remote transactions.');
      return useConnection((connection) => connection.exec(sql));
    },
    prepare(sql) {
      if (closed) throw new Error('Database is closed.');
      if (typeof sql !== 'string') throw new TypeError('SQL must be a string.');
      // Cache SQL, not a statement bound to a stream that may have expired.
      return {
        run: (...args) => useConnection((connection) => connection.prepare(sql).run(args)),
        get: (...args) => useConnection((connection) => cleanLibsqlRow(connection.prepare(sql).get(args))),
        all: (...args) => useConnection((connection) => connection.prepare(sql).all(args).map(cleanLibsqlRow)),
      };
    },
    transaction(fn) {
      if (typeof fn !== 'function') throw new TypeError('Transaction callback must be a function.');
      return (...args) => {
        if (transactionConnection) throw new Error('Nested database transactions are not supported.');
        return useConnection((connection) => {
          transactionConnection = connection;
          try {
            connection.exec('BEGIN TRANSACTION;');
            try {
              const result = fn(...args);
              if (result && typeof result.then === 'function') throw new Error('Database transaction callbacks must be synchronous.');
              connection.exec('COMMIT;');
              return result;
            } catch (error) {
              try { connection.exec('ROLLBACK;'); } catch {}
              throw error;
            }
          } finally {
            transactionConnection = null;
          }
        });
      };
    },
    close() {
      if (transactionConnection) throw new Error('Cannot close a database during a transaction.');
      closed = true;
    },
  };
}

function openDatabase(config = databaseConfiguration(), { createRemoteClient } = {}) {
  if (config.remote) {
    return openRemoteDatabase(createRemoteClient || (() => new (require('libsql'))(config.url, { authToken: config.token })));
  }
  if (config.dbPath) fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = config.driver === 'libsql'
    ? new (require('libsql'))(config.dbPath)
    : new (require('node:sqlite').DatabaseSync)(config.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (!config.remote) {
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
  }
  // libSQL attaches query timing metadata to rows. Keep the API's existing row shape.
  if (config.driver === 'libsql') {
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      const statement = prepare(sql);
      return {
        run: (...args) => statement.run(args),
        get: (...args) => cleanLibsqlRow(statement.get(args)),
        all: (...args) => statement.all(args).map(cleanLibsqlRow),
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
