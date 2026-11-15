const { DatabaseSync } = require('node:sqlite');

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

// VACUUM INTO on a cloud database cannot write onto this application's disk.
// Copy a consistent remote read transaction into a standard local SQLite backup.
function writeDatabaseSnapshot(source, destination) {
  const target = new DatabaseSync(destination);
  let reading = false;
  try {
    source.exec('BEGIN;');
    reading = true;
    const schema = source.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    target.exec('PRAGMA foreign_keys = OFF; BEGIN;');
    for (const table of schema.filter((entry) => entry.type === 'table')) {
      target.exec(table.sql);
      const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`).all().map((column) => column.name);
      const insert = target.prepare(`INSERT INTO ${quoteIdentifier(table.name)} (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (let offset = 0; ; offset += 500) {
        const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 500 OFFSET ?`).all(offset);
        for (const row of rows) {
          try { insert.run(...columns.map((column) => row[column])); }
          catch (error) { throw new Error(`Snapshot copy failed for ${table.name} (${columns.map((column) => `${column}:${typeof row[column]}`).join(', ')}): ${error.message}`); }
        }
        if (rows.length < 500) break;
      }
    }
    if (source.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
      target.exec('DELETE FROM sqlite_sequence;');
      const insert = target.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)');
      for (const row of source.prepare('SELECT name,seq FROM sqlite_sequence').all()) insert.run(row.name, row.seq);
    }
    for (const entry of schema.filter((item) => item.type !== 'table')) target.exec(entry.sql);
    target.exec('COMMIT;');
    if (target.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || target.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('The database snapshot failed integrity validation.');
    }
    source.exec('COMMIT;');
    reading = false;
  } finally {
    if (reading) { try { source.exec('ROLLBACK;'); } catch {} }
    target.close();
  }
}

module.exports = { writeDatabaseSnapshot };
