'use strict';

/**
 * Pure, dependency-free logic for resolving which DATABASE_URL a host-side
 * Prisma/seed command should use, given an explicit service key. No I/O
 * here beyond parsing text already handed in by the caller — this module
 * never reads files or env vars itself, which is what makes it directly
 * unit-testable (see db-target.test.js).
 *
 * Uses Map, not a plain object, for the service registries: a plain
 * object's `in`/property lookups are prototype-sensitive (a service key of
 * 'toString', 'constructor', or '__proto__' would resolve to something on
 * Object.prototype rather than correctly reporting "unknown service").
 * Map.prototype.has()/get() only ever see keys actually set on the map.
 */

const SERVICE_ENV_VARS = new Map([
  ['identity', 'IDENTITY_DATABASE_URL'],
  ['sales', 'SALES_DATABASE_URL'],
  ['inventory', 'INVENTORY_DATABASE_URL'],
  ['accounting', 'ACCOUNTING_DATABASE_URL'],
  ['purchase', 'PURCHASE_DATABASE_URL'],
  ['master-data', 'MASTER_DATA_DATABASE_URL'],
  ['production', 'PRODUCTION_DATABASE_URL'],
]);

const EXPECTED_DB_NAME = new Map([
  ['identity', 'identity_db'],
  ['sales', 'sales_db'],
  ['inventory', 'inventory_db'],
  ['accounting', 'accounting_db'],
  ['purchase', 'purchase_db'],
  ['master-data', 'master_data_db'],
  ['production', 'production_db'],
]);

/**
 * Minimal .env parser: skips blank lines and full-line comments, splits on
 * the first '=', trims, and strips one layer of matching surrounding
 * quotes. Tolerates CRLF line endings (this repo's .env is Windows-edited).
 * Deliberately not a dependency on the (only transitively available,
 * never declared) `dotenv` package.
 */
function parseEnvFile(text) {
  const result = Object.create(null);
  if (!text) return result;
  const lines = text.split(/\r\n|\r|\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Extracts just the database name from a Postgres connection string using
 * the built-in WHATWG URL parser (pathname is always "/<dbname>"), rather
 * than a hand-rolled regex — handles a present/absent port, query string,
 * trailing slash, and unusual host forms uniformly. Returns null if the
 * string isn't a parseable URL at all (caller treats that as "unknown",
 * not a crash).
 */
function extractDatabaseName(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return parsed.pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

/**
 * Resolves the DATABASE_URL a given service's command should run with.
 *
 * @param {string} service - one of SERVICE_ENV_VARS' keys.
 * @param {{ processEnv: Record<string, string | undefined>, envFileContents?: string, allowAnyDbName?: boolean }} options
 * @returns {{ ok: true, varName: string, url: string, dbName: string } | { ok: false, error: string }}
 *
 * process.env always wins over the .env file value, matching the
 * non-destructive precedence already relied on elsewhere in this repo
 * (seed.ts's own `config({ path: ... })` call never overrides an
 * already-set process.env variable either).
 */
function resolveDatabaseUrl(service, options) {
  const { processEnv, envFileContents, allowAnyDbName } = options;

  if (!SERVICE_ENV_VARS.has(service)) {
    return {
      ok: false,
      error: `Unknown service "${service}". Valid services: ${[...SERVICE_ENV_VARS.keys()].join(', ')}`,
    };
  }

  const varName = SERVICE_ENV_VARS.get(service);
  const fromProcess = processEnv ? processEnv[varName] : undefined;
  const fileValues = envFileContents ? parseEnvFile(envFileContents) : null;
  const fromFile = fileValues ? fileValues[varName] : undefined;
  const url = fromProcess || fromFile;

  if (!url) {
    return {
      ok: false,
      error: `${varName} is not set (checked the process environment and .env). Set it before running this command.`,
    };
  }

  const actualDbName = extractDatabaseName(url);
  const expectedDbName = EXPECTED_DB_NAME.get(service);
  if (!allowAnyDbName && actualDbName !== expectedDbName) {
    return {
      ok: false,
      error: `${varName} targets database "${actualDbName ?? '(unparseable)'}", expected "${expectedDbName}" for service "${service}". Refusing to run — this is exactly the cross-service mismatch this wrapper exists to catch.`,
    };
  }

  return { ok: true, varName, url, dbName: actualDbName };
}

module.exports = {
  SERVICE_ENV_VARS,
  EXPECTED_DB_NAME,
  parseEnvFile,
  extractDatabaseName,
  resolveDatabaseUrl,
};
