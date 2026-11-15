const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const destination = path.join(__dirname, '..', '.env.production.keys');
const content = ['JWT_SECRET', 'MFA_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY']
  .map((key) => `${key}=${crypto.randomBytes(32).toString('hex')}`).join('\n') + '\n';
try {
  fs.writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  console.log(`Private keys saved to ${destination}. Import them into Render's environment settings. This file is excluded from Git. Existing keys are never overwritten.`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'A private key file already exists. Reuse the saved keys; changing them can invalidate sessions and stored MFA secrets.' : 'Could not write the private key file.');
  process.exitCode = 1;
}
