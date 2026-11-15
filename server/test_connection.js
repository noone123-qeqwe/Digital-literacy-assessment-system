// Exercise the remote adapter against the native driver and a temporary file.
// No cloud credentials or production records are used.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const NativeDatabase = require('libsql');
const { openDatabase } = require('./db/connection');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-connection-test-'));
let opened = 0;
let closed = 0;
let loseWriteResponse = false;
let loseCommitResponse = false;
const database = openDatabase({ remote: true, driver: 'libsql' }, {
  createRemoteClient() {
    opened += 1;
    const connection = new NativeDatabase(path.join(directory, 'database.sqlite'));
    return {
      exec(sql) {
        const result = connection.exec(sql);
        if (loseCommitResponse && sql === 'COMMIT;') {
          loseCommitResponse = false;
          throw new Error('Commit response was lost.');
        }
        return result;
      },
      prepare(sql) {
        const statement = connection.prepare(sql);
        return {
          get: (args) => statement.get(args),
          all: (args) => statement.all(args),
          run(args) {
            const result = statement.run(args);
            if (loseWriteResponse) {
              loseWriteResponse = false;
              throw new Error('Write response was lost.');
            }
            return result;
          },
        };
      },
      close() { closed += 1; connection.close(); },
    };
  },
});

test('cached SQL remains usable after its previous native session is closed', () => {
  database.exec('CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, picture BLOB); CREATE TABLE children(parent_id INTEGER REFERENCES records(id));');
  const insert = database.prepare('INSERT INTO records(name,picture) VALUES(?,?)');
  insert.run('first', Buffer.from('image'));
  assert.equal(opened, closed);
  insert.run('second', null);
  const row = database.prepare('SELECT * FROM records WHERE name=?').get('first');
  assert.deepEqual(row.picture, Buffer.from('image'));
  assert.equal(row._metadata, undefined);
  assert.equal(database.prepare('SELECT id FROM records').all().length, 2);
  assert.equal(opened, closed);
});

test('transaction uses one session for all statements and rolls back partial changes', () => {
  const before = opened;
  const insert = database.prepare('INSERT INTO records(name) VALUES(?)');
  assert.throws(database.transaction(() => {
    assert.equal(database.inTransaction, true);
    insert.run('rolled-back');
    database.prepare('INSERT INTO children(parent_id) VALUES(?)').run(999999);
  }), /FOREIGN KEY/);
  assert.equal(opened - before, 1);
  assert.equal(database.inTransaction, false);
  assert.equal(database.prepare('SELECT id FROM records WHERE name=?').get('rolled-back'), undefined);
  assert.throws(() => database.prepare('INSERT INTO children(parent_id) VALUES(?)').run(999999), /FOREIGN KEY/);
  assert.equal(opened, closed);
});

test('ambiguous write and commit failures are never replayed', () => {
  const insert = database.prepare('INSERT INTO records(name) VALUES(?)');
  loseWriteResponse = true;
  const beforeWrite = opened;
  assert.throws(() => insert.run('write-once'), /Write response was lost/);
  assert.equal(opened - beforeWrite, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM records WHERE name=?').get('write-once').count, 1);
  loseCommitResponse = true;
  let callbacks = 0;
  assert.throws(database.transaction(() => { callbacks += 1; insert.run('commit-once'); }), /Commit response was lost/);
  assert.equal(callbacks, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM records WHERE name=?').get('commit-once').count, 1);
  assert.equal(opened, closed);
});

test('remote snapshots share one consistent read transaction and retain binary data', () => {
  const before = opened;
  const snapshotPath = path.join(directory, 'snapshot.sqlite');
  require('./db/snapshot').writeDatabaseSnapshot(database, snapshotPath);
  assert.equal(opened - before, 1);
  const snapshot = new (require('node:sqlite').DatabaseSync)(snapshotPath);
  try {
    assert.equal(snapshot.prepare('SELECT COUNT(*) AS count FROM records').get().count, 4);
    assert.deepEqual(Buffer.from(snapshot.prepare("SELECT picture FROM records WHERE name='first'").get().picture), Buffer.from('image'));
    assert.equal(snapshot.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally { snapshot.close(); }
});

test('remote failures do not switch to local storage and closed adapters stay closed', () => {
  let attempts = 0;
  const unavailable = openDatabase({ remote: true, driver: 'libsql' }, {
    createRemoteClient() { attempts += 1; throw new Error('Remote unavailable.'); },
  });
  assert.throws(() => unavailable.prepare('SELECT 1').get(), /Remote unavailable/);
  assert.equal(attempts, 1);
  assert.throws(() => database.exec('BEGIN;'), /transaction/);
  const cached = database.prepare('SELECT 1');
  database.close();
  assert.throws(() => cached.get(), /closed/);
  assert.throws(() => database.prepare('SELECT 1'), /closed/);
  assert.equal(opened, closed);
});

after(async () => {
  database.close();
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
