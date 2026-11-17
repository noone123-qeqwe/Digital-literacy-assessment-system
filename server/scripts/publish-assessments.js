const fs = require('node:fs');
const path = require('node:path');
const { validateAssessmentPack, publishAssessmentPack } = require('../db/assessmentPack');

function main() {
  const args = process.argv.slice(2);
  const filename = args[args.indexOf('--file') + 1];
  if (!args.includes('--file') || !filename || filename.startsWith('--')) throw new Error('Provide --file <private-pack.json>.');
  const pack = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  const quizzes = validateAssessmentPack(pack);
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ validated: true, version: pack.version, assessments: quizzes.length, questions: quizzes.reduce((n, q) => n + q.questions.length, 0) }));
    return;
  }
  const administratorId = Number(args[args.indexOf('--administrator-id') + 1]);
  if (!args.includes('--administrator-id') || !Number.isSafeInteger(administratorId) || administratorId < 1) throw new Error('Provide an administrator ID.');
  if (process.env.NODE_ENV !== 'production' || process.env.DLAS_FREE_DEMO !== 'false') throw new Error('Use the real-account production configuration.');
  const { db, databaseConfig, initializeDatabase } = require('../db/database');
  try {
    if (!databaseConfig.remote) throw new Error('Publication requires the persistent cloud database.');
    initializeDatabase();
    const manifest = publishAssessmentPack(db, pack, administratorId);
    console.log(JSON.stringify({ published: true, alreadyPublished: Boolean(manifest.alreadyPublished), version: manifest.version,
      assessments: manifest.assessments, questions: manifest.questions }));
  } finally { db.close(); }
}
if (require.main === module) {
  try { main(); } catch { console.error('Assessment publication failed. Check the private file, version, administrator, and database configuration.'); process.exitCode = 1; }
}
module.exports = { main };
