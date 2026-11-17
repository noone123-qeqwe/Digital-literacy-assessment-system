const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

async function run() {
  for (const script of ['test_system.js', 'test_knowledge.js', 'test_quiz_completion.js', 'test_curriculum.js', 'test_assessment_pack.js', 'test_bookmarks.js']) {
    let cleanupDirectory;
    const child = fork(path.join(__dirname, '..', script), [], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DLAS_DATABASE_DRIVER: 'libsql', DLAS_TEST_PARENT_CLEANUP: 'true' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.on('message', (message) => { cleanupDirectory = message.cleanupDirectory; });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    if (cleanupDirectory) {
      const resolved = path.resolve(cleanupDirectory);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !/^dlas-(integration|knowledge-test|quiz-completion-test|curriculum-test|pack-test|bookmarks-test)-/.test(path.basename(resolved))) throw new Error('Unexpected test cleanup directory.');
      // Windows releases native database file handles when the child exits.
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
    if (code !== 0) { process.exitCode = code || 1; return; }
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
