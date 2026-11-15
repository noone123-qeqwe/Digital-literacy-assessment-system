const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const MAGIC = Buffer.from('DLASBK01');

function verifyBackup(backupPath) {
  if (!backupPath) throw new Error('Usage: npm run verify-backup -- <path-to-backup.sqlite.enc>');
  const keyValue = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(keyValue)) throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  const encrypted = fs.readFileSync(path.resolve(backupPath));
  if (encrypted.length < MAGIC.length + 12 + 16 || !encrypted.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('The selected file is not a supported DLAS encrypted backup.');
  }

  const ivStart = MAGIC.length;
  const iv = encrypted.subarray(ivStart, ivStart + 12);
  const authTag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(ivStart + 12, -16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyValue, 'hex'), iv);
  decipher.setAuthTag(authTag);
  const sqliteBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-backup-check-'));
  const tempDatabase = path.join(tempDirectory, 'verification.sqlite');
  let database;
  try {
    fs.writeFileSync(tempDatabase, sqliteBytes, { mode: 0o600, flag: 'wx' });
    database = new DatabaseSync(tempDatabase);
    database.exec('PRAGMA query_only = ON;');
    const integrity = database.prepare('PRAGMA quick_check').all();
    if (integrity.length !== 1 || integrity[0].quick_check !== 'ok') throw new Error('SQLite integrity check failed.');
    const tableCount = database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count;
    if (!tableCount) throw new Error('The backup contains no application tables.');
    return { integrity: 'ok', tableCount };
  } finally {
    database?.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const result = verifyBackup(process.argv[2]);
    console.log(`Backup verified: SQLite integrity is ${result.integrity}; found ${result.tableCount} application tables.`);
  } catch (error) {
    console.error(`Backup verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyBackup };
