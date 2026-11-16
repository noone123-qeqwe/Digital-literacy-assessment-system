const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function exerciseStartup(hasActiveAdmin) {
  const launcher = path.join(__dirname, 'start-production.js');
  const script = [
    "const Module = require('node:module');",
    "const original = Module._load;",
    "const launcher = " + JSON.stringify(launcher) + ";",
    "let bootstrapCalls = 0; let startCalls = 0;",
    "Module._load = function(name, parent, isMain) {",
    "if (name.includes('ensureStaffAccounts')) throw Error('Sample-account reset must not run');",
    "if (parent?.filename === launcher && name === '../server') return { startServer() { startCalls++; return 'listening'; } };",
    "if (parent?.filename === launcher && name === '../db/database') return { db: { prepare(sql) {",
    "if (!sql.includes(\"status='active'\") || sql.includes('is_demo')) throw Error('An active test administrator must be recognized');",
    "return { get() { return " + (hasActiveAdmin ? "{ id: 13 }" : "undefined") + "; } };",
    "} } };",
    "if (parent?.filename === launcher && name === './bootstrap-admin') return { async bootstrapAdmin() { bootstrapCalls++; } };",
    "return original.call(this, name, parent, isMain); };",
    "process.env.NODE_ENV = 'production'; process.env.DLAS_FREE_DEMO = 'false';",
    "require(launcher).startProduction().then(result => console.log(JSON.stringify({ result, bootstrapCalls, startCalls }))).catch(() => process.exitCode = 1);",
  ].join('\n');
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', windowsHide: true }).trim());
}

test('an active test administrator survives production startup without sample-account resets', () => {
  assert.deepEqual(exerciseStartup(true), { result: 'listening', bootstrapCalls: 0, startCalls: 1 });
});

test('startup still provisions the initial administrator when no active one exists', () => {
  assert.deepEqual(exerciseStartup(false), { result: 'listening', bootstrapCalls: 1, startCalls: 1 });
});
