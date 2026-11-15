const fs = require('node:fs');
const path = require('node:path');
const { validateCourse, publishFoundationCurriculum } = require('../db/foundationCurriculum');

function main() {
  const args = process.argv.slice(2);
  const filename = args[args.indexOf('--file') + 1];
  if (!args.includes('--file') || !filename || filename.startsWith('--')) throw new Error('Provide --file <private-course.json>. Add --apply and --administrator-id <id> to publish.');
  const course = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  const forms = validateCourse(course);
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ validated: true, version: course.version, forms: forms.map(f => ({ stage: f.stage, questions: f.questions.length })) }));
    return;
  }
  const administratorId = Number(args[args.indexOf('--administrator-id') + 1]);
  if (!args.includes('--administrator-id') || !Number.isSafeInteger(administratorId) || administratorId < 1) throw new Error('Provide a valid --administrator-id.');
  if (process.env.NODE_ENV !== 'production' || process.env.DLAS_FREE_DEMO !== 'false') throw new Error('Publication requires the real-account production configuration.');
  const { db, databaseConfig, initializeDatabase } = require('../db/database');
  try {
    if (!databaseConfig.remote) throw new Error('This publication command requires the configured persistent cloud database.');
    initializeDatabase();
    const manifest = publishFoundationCurriculum(db, course, administratorId);
    console.log(JSON.stringify({ published: true, alreadyPublished: Boolean(manifest.alreadyPublished), version: manifest.version, questions: manifest.questions, quizIds: manifest.quizIds }));
  } finally { db.close(); }
}
if (require.main === module) {
  try { main(); } catch (error) {
    // Never include private question data, answers, or provider responses.
    console.error('Course publication failed. Check the private input, version, administrator, and database configuration.');
    process.exitCode = 1;
  }
}
module.exports = { main };
