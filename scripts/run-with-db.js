#!/usr/bin/env node
'use strict';

/**
 * Runs a host-side command (Prisma migrate, the identity seed, etc.) with
 * DATABASE_URL explicitly set to the correct service's database, so it can
 * never silently fall back to whatever the shared root .env's old generic
 * DATABASE_URL happens to be pointed at that day.
 *
 * Usage: node scripts/run-with-db.js <service> -- <command> [args...]
 * Example (as used by package.json):
 *   node scripts/run-with-db.js identity -- prisma migrate dev --schema=apps/identity-service/prisma/schema.prisma
 *
 * ## Cross-platform executable resolution
 *
 * On Windows, "prisma"/"ts-node" resolve to .cmd shim files in
 * node_modules/.bin, and Node's child_process cannot exec a .cmd file
 * directly without a shell (a documented Node/Windows limitation —
 * https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows).
 *
 * An earlier version of this script worked around that with
 * `shell: true` plus an args array. That turned out to be actively unsafe,
 * not just a style preference: Node's own runtime emits
 * `DEP0190: Passing args to a child process with shell option true can
 * lead to security vulnerabilities, as the arguments are not escaped,
 * only concatenated` — verified directly (a path containing a space, e.g.
 * the default Windows Node install path "C:\Program Files\nodejs\...",
 * broke in exactly this way: cmd.exe split it into two tokens).
 *
 * So the primary strategy here never touches a shell at all: resolve the
 * target package's own "bin" field (from its package.json, the same way
 * npm builds the .cmd shim in the first place) to find the real,
 * non-shim JS entry script, and run that directly as
 * `node <resolved-script> [args...]` with shell:false. node.exe is a real
 * executable (never a shim), so this needs no shell on any platform, and
 * argv is passed as a genuine array with no string concatenation or
 * escaping involved anywhere — the DEP0190 class of bug cannot occur.
 *
 * Only if that resolution fails (the command isn't a locally installed
 * package exposing a same-named "bin" entry — not the case for any
 * command this repo's package.json currently runs through this wrapper)
 * does it fall back to `shell: true` on Windows only, with each argument
 * explicitly quoted for cmd.exe by this script itself (never relying on
 * Node to do it, per DEP0190). That fallback's quoting handles the
 * arguments actually used in this repo (plain paths and `--flag=value`
 * tokens, no embedded quotes) but is not a complete cmd.exe parser;
 * treat it as a documented, bounded compatibility shim, not a general
 * guarantee for arbitrary future arguments.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveDatabaseUrl } = require('./lib/db-target');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Resolves `command` (a bare package/bin name, e.g. "prisma") to the real
 * JS file its own package.json "bin" field points at, or null if it can't
 * be resolved this way. Mirrors exactly how npm itself builds the
 * node_modules/.bin/<command>.cmd shim, so finding the same target this
 * way is not a guess — it is the shim's own source of truth.
 */
function resolveBinScript(command) {
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${command}/package.json`, { paths: [REPO_ROOT] });
  } catch {
    return null;
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    return null;
  }
  const bin = pkg.bin;
  let relBinPath;
  if (typeof bin === 'string') {
    relBinPath = bin;
  } else if (bin && typeof bin === 'object') {
    relBinPath = bin[command] || Object.values(bin)[0];
  }
  if (!relBinPath) return null;
  const resolved = path.resolve(path.dirname(pkgJsonPath), relBinPath);
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * Fallback-only cmd.exe argument quoting, used solely when a command
 * can't be resolved to a real script via resolveBinScript() and shell:true
 * is therefore unavoidable on Windows. Handles the realistic input this
 * repo actually passes (plain paths, `--flag=value` tokens) — not a
 * general-purpose cmd.exe parser. See the module doc comment above.
 */
function quoteArgForWindowsShell(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

function buildSpawnPlan(command, commandArgs) {
  const binScript = resolveBinScript(command);
  if (binScript) {
    return { target: process.execPath, args: [binScript, ...commandArgs], shell: false };
  }
  if (process.platform === 'win32') {
    return {
      target: [command, ...commandArgs].map(quoteArgForWindowsShell).join(' '),
      args: [],
      shell: true,
    };
  }
  return { target: command, args: commandArgs, shell: false };
}

function main() {
  const args = process.argv.slice(2);
  const sepIndex = args.indexOf('--');

  if (sepIndex <= 0) {
    console.error('[run-with-db] Usage: node scripts/run-with-db.js <service> -- <command> [args...]');
    process.exit(1);
  }

  const service = args[0];
  const commandParts = args.slice(sepIndex + 1);
  if (commandParts.length === 0) {
    console.error('[run-with-db] No command given after "--".');
    process.exit(1);
  }

  // RUN_WITH_DB_ENV_FILE lets callers (tests, or an alternate local setup)
  // point at a different .env-shaped file; defaults to the repo's real
  // .env. process.env itself still always takes precedence over whatever
  // this file contains (see resolveDatabaseUrl).
  const envFilePath = process.env.RUN_WITH_DB_ENV_FILE || path.join(REPO_ROOT, '.env');
  const envFileContents = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';

  const resolved = resolveDatabaseUrl(service, {
    processEnv: process.env,
    envFileContents,
  });

  if (!resolved.ok) {
    console.error(`[run-with-db] ${resolved.error}`);
    process.exit(1);
  }

  // Diagnostic only — the service name and bare database name, never the
  // full connection string (which carries credentials).
  console.log(`[run-with-db] service=${service} db=${resolved.dbName} (via ${resolved.varName})`);

  const [command, ...commandArgs] = commandParts;
  const plan = buildSpawnPlan(command, commandArgs);

  const result = spawnSync(plan.target, plan.args, {
    stdio: 'inherit',
    shell: plan.shell,
    env: { ...process.env, DATABASE_URL: resolved.url },
  });

  if (result.error) {
    console.error(`[run-with-db] Failed to run "${command}": ${result.error.message}`);
    process.exit(1);
  }

  // Propagate the child's exact exit code. A null status means the child
  // was killed by a signal (result.signal set instead) — exit 1 rather
  // than let `process.exit(null)` coerce to success.
  process.exit(result.status === null ? 1 : result.status);
}

main();
