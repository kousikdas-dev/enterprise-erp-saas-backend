'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVICE_ENV_VARS,
  parseEnvFile,
  extractDatabaseName,
  resolveDatabaseUrl,
} = require('./db-target');

test('resolveDatabaseUrl: service selection picks the correct env var', () => {
  const result = resolveDatabaseUrl('identity', {
    processEnv: { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.varName, 'IDENTITY_DATABASE_URL');
  assert.equal(result.dbName, 'identity_db');
});

test('resolveDatabaseUrl: every registered service maps to a distinct env var', () => {
  const varNames = [...SERVICE_ENV_VARS.values()];
  assert.equal(new Set(varNames).size, varNames.length, 'env var names must be unique per service');
});

test('resolveDatabaseUrl: missing configuration (absent from process env and .env) fails with the exact var name', () => {
  const result = resolveDatabaseUrl('inventory', { processEnv: {}, envFileContents: '' });
  assert.equal(result.ok, false);
  assert.match(result.error, /INVENTORY_DATABASE_URL/);
  assert.match(result.error, /not set/);
});

test('resolveDatabaseUrl: invalid service name is rejected and lists valid services', () => {
  const result = resolveDatabaseUrl('not-a-real-service', { processEnv: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown service/);
  assert.match(result.error, /identity/);
});

test('resolveDatabaseUrl: prototype-chain keys are never treated as valid services (Map, not plain-object, lookup)', () => {
  for (const trap of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const result = resolveDatabaseUrl(trap, { processEnv: {} });
    assert.equal(result.ok, false, `"${trap}" must not resolve as a valid service`);
    assert.match(result.error, /Unknown service/);
  }
});

test('resolveDatabaseUrl: process.env takes precedence over the .env file value', () => {
  const result = resolveDatabaseUrl('identity', {
    processEnv: { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/identity_db?schema=public' },
    envFileContents: 'IDENTITY_DATABASE_URL=postgresql://u:p@localhost:15432/sales_db?schema=public',
  });
  assert.equal(result.ok, true);
  assert.equal(result.dbName, 'identity_db');
});

test('resolveDatabaseUrl: falls back to the .env file value when process.env does not have it', () => {
  const result = resolveDatabaseUrl('sales', {
    processEnv: {},
    envFileContents: 'SOME_OTHER_KEY=x\nSALES_DATABASE_URL=postgresql://u:p@localhost:15432/sales_db?schema=public\n',
  });
  assert.equal(result.ok, true);
  assert.equal(result.dbName, 'sales_db');
});

test('resolveDatabaseUrl: a wrong-database URL is rejected, naming expected vs. actual', () => {
  const result = resolveDatabaseUrl('identity', {
    processEnv: { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/sales_db?schema=public' },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /targets database "sales_db"/);
  assert.match(result.error, /expected "identity_db"/);
});

test('resolveDatabaseUrl: allowAnyDbName bypasses the name-match check explicitly', () => {
  const result = resolveDatabaseUrl('identity', {
    processEnv: { IDENTITY_DATABASE_URL: 'postgresql://u:p@localhost:15432/some_custom_db?schema=public' },
    allowAnyDbName: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dbName, 'some_custom_db');
});

test('resolveDatabaseUrl: never includes the connection string or credentials in an error message', () => {
  const result = resolveDatabaseUrl('identity', {
    processEnv: { IDENTITY_DATABASE_URL: 'postgresql://secretuser:secretpass@localhost:15432/sales_db?schema=public' },
  });
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /secretuser/);
  assert.doesNotMatch(result.error, /secretpass/);
});

test('parseEnvFile: handles CRLF line endings, comments, blank lines, and quoted values', () => {
  const text = [
    '# a comment',
    '',
    'FOO=bar',
    'QUOTED="hello world"',
    "SINGLE='single quoted'",
    'DATABASE_URL=postgresql://u:p@localhost:15432/identity_db?schema=public',
  ].join('\r\n');
  const parsed = parseEnvFile(text);
  assert.equal(parsed.FOO, 'bar');
  assert.equal(parsed.QUOTED, 'hello world');
  assert.equal(parsed.SINGLE, 'single quoted');
  assert.equal(parsed.DATABASE_URL, 'postgresql://u:p@localhost:15432/identity_db?schema=public');
});

test('parseEnvFile: returns an empty, prototype-free object for empty input', () => {
  const parsed = parseEnvFile('');
  assert.deepEqual(Object.keys(parsed), []);
});

test('extractDatabaseName: parses db name with a port and query string present', () => {
  assert.equal(
    extractDatabaseName('postgresql://u:p@localhost:15432/identity_db?schema=public'),
    'identity_db',
  );
});

test('extractDatabaseName: parses db name with no query string and no trailing slash quirks', () => {
  assert.equal(extractDatabaseName('postgresql://u:p@localhost:5432/production_db'), 'production_db');
});

test('extractDatabaseName: returns null for an unparseable string rather than throwing', () => {
  assert.equal(extractDatabaseName('not a url at all'), null);
});
