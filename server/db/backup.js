const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { db, dbPath } = require('./database');

const MAGIC = Buffer.from('DLASBK01');
const backupStatus = { lastSuccessAt: null, lastFailureAt: null, lastError: null, isRunning: false };

function getEncryptionKey() {
  const value = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters (32 random bytes).');
  return Buffer.from(value, 'hex');
}

function quoteSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pruneOldBackups(directory) {
  const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10) || 30);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^dlas-.*\.sqlite\.enc$/.test(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (fs.statSync(fullPath).mtimeMs < cutoff) fs.unlinkSync(fullPath);
  }
}

async function createEncryptedBackup() {
  const key = getEncryptionKey();
  const directory = path.resolve(process.env.BACKUP_DIRECTORY || path.join(__dirname, '..', 'backups'));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const snapshotDirectory = path.join(directory, '.snapshots');
  fs.mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(snapshotDirectory, 0o700);
  for (const entry of fs.readdirSync(snapshotDirectory, { withFileTypes: true })) {
    if (entry.isFile() && /^snapshot-\d+-.*\.sqlite$/.test(entry.name)) {
      fs.rmSync(path.join(snapshotDirectory, entry.name), { force: true });
    }
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(snapshotDirectory, `snapshot-${process.pid}-${timestamp}.sqlite`);
  const temporaryPath = path.join(directory, `.dlas-${timestamp}.sqlite.enc.tmp`);
  const backupPath = path.join(directory, `dlas-${timestamp}.sqlite.enc`);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  try {
    db.exec(`VACUUM INTO ${quoteSqlString(snapshotPath)}`);
    fs.chmodSync(snapshotPath, 0o600);
    const output = fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
    output.write(Buffer.concat([MAGIC, iv]));
    await pipeline(fs.createReadStream(snapshotPath), cipher, output);
    await fs.promises.appendFile(temporaryPath, cipher.getAuthTag(), { mode: 0o600 });
    await fs.promises.rename(temporaryPath, backupPath);
    pruneOldBackups(directory);
    return backupPath;
  } finally {
    for (const cleanupPath of [snapshotPath, temporaryPath]) {
      try { await fs.promises.rm(cleanupPath, { force: true }); } catch {}
    }
  }
}

function startAutomaticBackups() {
  const intervalHours = Math.max(1, Number.parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10) || 6);
  let running = false;
  let retryTimer = null;
  const scheduleRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      execute(false);
    }, 15 * 60_000);
    retryTimer.unref?.();
  };
  const execute = async (failOnError = false) => {
    if (running) return false;
    running = true;
    backupStatus.isRunning = true;
    try {
      const file = await createEncryptedBackup();
      backupStatus.lastSuccessAt = new Date().toISOString();
      backupStatus.lastError = null;
      console.info(`Encrypted SQLite backup created: ${path.basename(file)}`);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return true;
    } catch (error) {
      backupStatus.lastFailureAt = new Date().toISOString();
      backupStatus.lastError = error.message;
      console.error('Encrypted SQLite backup failed:', error.message);
      if (process.env.NODE_ENV === 'production') process.exitCode = 1;
      scheduleRetry();
      if (failOnError) throw error;
      return false;
    } finally {
      running = false;
      backupStatus.isRunning = false;
    }
  };
  const timer = setInterval(() => execute(false), intervalHours * 3_600_000);
  timer.unref?.();
  return execute(true);
}

function getBackupStatus() {
  const isReady = Boolean(backupStatus.lastSuccessAt)
    && (!backupStatus.lastFailureAt || Date.parse(backupStatus.lastSuccessAt) >= Date.parse(backupStatus.lastFailureAt));
  return { ...backupStatus, isReady };
}

module.exports = { createEncryptedBackup, startAutomaticBackups, getBackupStatus, MAGIC };
