const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');
const { DatabaseSync } = require('node:sqlite');
const MAGIC = Buffer.from('DLASBK01');

function keyFromEnvironment() {
  const value = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}

async function decryptToFile(backupPath, outputPath, key) {
  const stat = await fs.promises.stat(backupPath);
  if (stat.size < MAGIC.length + 12 + 16) throw new Error('Backup file is incomplete.');
  const handle = await fs.promises.open(backupPath, 'r');
  try {
    const header = Buffer.alloc(MAGIC.length + 12);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unsupported backup format.');
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, tag.length, stat.size - tag.length);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(backupPath, { start: header.length, end: stat.size - tag.length - 1 }),
      decipher,
      createWriteStream(outputPath, { flags: 'wx', mode: 0o600 })
    );
  } finally { await handle.close(); }
}

async function restore(backupPath, targetPath) {
  const resolvedBackup = path.resolve(backupPath);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedBackup === resolvedTarget) throw new Error('Backup and database paths must be different.');
  const directory = path.dirname(resolvedTarget);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.dlas-restore-${process.pid}-${Date.now()}.sqlite`);
  const previous = `${resolvedTarget}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    await decryptToFile(resolvedBackup, temporary, keyFromEnvironment());
    const candidate = new DatabaseSync(temporary);
    const check = candidate.prepare('PRAGMA quick_check').get();
    candidate.close();
    if (!check || check.quick_check !== 'ok') throw new Error('Backup database failed SQLite integrity check.');
    if (fs.existsSync(resolvedTarget)) await fs.promises.rename(resolvedTarget, previous);
    await fs.promises.rename(temporary, resolvedTarget);
    for (const suffix of ['-wal', '-shm']) {
      try { await fs.promises.rm(`${resolvedTarget}${suffix}`, { force: true }); } catch {}
    }
    console.log(`Database restored to ${resolvedTarget}`);
    if (fs.existsSync(previous)) console.log(`Previous database preserved at ${previous}`);
  } finally {
    try { await fs.promises.rm(temporary, { force: true }); } catch {}
  }
}

if (require.main === module) {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Usage: node db/restore.js <encrypted-backup-file>');
    process.exitCode = 2;
  } else {
    const target = path.resolve(process.env.DLAS_DB_PATH || path.join(__dirname, 'dlas.db'));
    restore(backupPath, target).catch((error) => {
      console.error('Restore failed:', error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { restore };
