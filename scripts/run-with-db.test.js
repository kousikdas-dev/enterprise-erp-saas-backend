'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const WRAPPER = path.resolve(__dirname, 'run-with-db.js');
const BIN_DIR = path.resolve(__dirname, '..', 'node_modules', '.bin');
// A path that is guaranteed not to exist, so every test below is isolated
// from whatever the real repo .env currently contains (it legitimately
// has all 7 keys configured after this fix lands — tests must not depend
// on that, or on its absence either).
const NO_ENV_FILE = path.resolve(__dirname, '__does_not_exist__.env');

function runWrapper(args, env) {
  // When package.json runs this wrapper via `npm run`, npm already
  // prepends node_modules/.bin to PATH before spawning — that's how
  // "prisma"/"ts-node" resolve for real at runtime. This test invokes the
  // wrapper directly (bypassing npm) to assert on its own stdout/stderr/
  // exit code, so it has to add that same PATH entry itself to faithfully
  // reproduce the environment the wrapper actually runs in.
  const pathSep = process.platform === 'win32' ? ';' : ':';
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RUN_WITH_DB_ENV_FILE: NO_ENV_FILE,
      ...env,
      PATH: `${BIN_DIR}${pathSep}${process.env.PATH || ''}`,
    },
  });
}

test('exit-code propagation: the wrapper exits with exactly the child command\'s exit code', () => {
  const result = runWrapper(
    ['identity', '--', process.execPath, '-e', 'process.exit(7)'],
    { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
  );
  assert.equal(result.status, 7);
});

test('exit-code propagation: a successful child command yields exit code 0', () => {
  const result = runWrapper(
    ['identity', '--', process.execPath, '-e', 'process.exit(0)'],
    { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
  );
  assert.equal(result.status, 0);
});

test('invalid service name: wrapper exits 1 and never spawns the command (no DATABASE_URL leak into a real process)', () => {
  const result = runWrapper(['not-a-service', '--', process.execPath, '-e', 'process.exit(0)'], {});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown service/);
});

test('missing configuration: wrapper exits 1 and names the exact missing env var, without ever invoking the command', () => {
  const env = { IDENTITY_DATABASE_URL: undefined };
  const result = runWrapper(['identity', '--', process.execPath, '-e', 'process.exit(0)'], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /IDENTITY_DATABASE_URL/);
  assert.match(result.stderr, /not set/);
});

test('deliberately mismatched database name: wrapper refuses before running the command', () => {
  const result = runWrapper(
    ['identity', '--', process.execPath, '-e', 'process.exit(0)'],
    { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/sales_db?schema=public' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /targets database "sales_db"/);
  assert.match(result.stderr, /expected "identity_db"/);
});

test('diagnostic output never prints the full connection string or credentials', () => {
  const result = runWrapper(
    ['identity', '--', process.execPath, '-e', 'process.exit(0)'],
    { IDENTITY_DATABASE_URL: 'postgresql://secretuser:secretpass@localhost:15432/identity_db?schema=public' },
  );
  assert.doesNotMatch(result.stdout, /secretuser/);
  assert.doesNotMatch(result.stdout, /secretpass/);
  assert.doesNotMatch(result.stderr, /secretuser/);
  assert.doesNotMatch(result.stderr, /secretpass/);
});

test('.env file fallback: wrapper reads DATABASE_URL from an env file when process.env does not have it', () => {
  const fs = require('fs');
  const os = require('os');
  const scratchEnvPath = path.join(os.tmpdir(), `run-with-db-test-${process.pid}.env`);
  fs.writeFileSync(
    scratchEnvPath,
    'IDENTITY_DATABASE_URL=postgresql://u:p@localhost:15432/identity_db?schema=public\r\n',
  );
  try {
    const pathSep = process.platform === 'win32' ? ';' : ':';
    const result = spawnSync(
      process.execPath,
      [WRAPPER, 'identity', '--', process.execPath, '-e', 'process.exit(0)'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          IDENTITY_DATABASE_URL: undefined,
          RUN_WITH_DB_ENV_FILE: scratchEnvPath,
          PATH: `${BIN_DIR}${pathSep}${process.env.PATH || ''}`,
        },
      },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /db=identity_db/);
  } finally {
    fs.unlinkSync(scratchEnvPath);
  }
});

test('usage error: missing "--" separator exits 1 with a usage message', () => {
  const result = runWrapper(['identity'], {});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

// "Test fixed package-script commands safely": run the ACTUAL prisma and
// ts-node binaries (the same .cmd shims package.json's scripts resolve on
// Windows) through the wrapper, using a flag that never opens a database
// connection — proving the conditional-shell executable resolution
// genuinely works end-to-end, not just against a synthetic `node -e`.
test('real package-script command: "prisma --version" resolves and runs through the wrapper on this platform (no DB contacted)', () => {
  const result = runWrapper(
    ['identity', '--', 'prisma', '--version'],
    { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
  );
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /prisma/i);
});

test('real package-script command: "ts-node --version" resolves and runs through the wrapper on this platform', () => {
  const result = runWrapper(
    ['identity', '--', 'ts-node', '--version'],
    { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
  );
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
});
