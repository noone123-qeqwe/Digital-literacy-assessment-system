require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { createEncryptedBackup } = require('../db/backup');
const { db } = require('../db/database');

createEncryptedBackup().then((file) => {
  console.log(`Encrypted backup created: ${file}`);
}).catch(() => {
  console.error('Encrypted backup failed. Check the database connection, encryption key, and backup directory.');
  process.exitCode = 1;
}).finally(() => db.close());
