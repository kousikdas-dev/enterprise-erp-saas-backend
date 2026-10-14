import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Maps each service's own PORT_ENV/short key to the explicit, unambiguous
 * host-side database URL variable introduced alongside
 * scripts/run-with-db.js. Kept as its own small map here (rather than
 * imported from scripts/lib/db-target.js) because that script is
 * dev-tooling-only and never bundled into a service's production build;
 * this list is intentionally tiny and mirrors the 7 databases
 * docker-compose.yml already provisions, so duplication is a bounded,
 * low-risk tradeoff, not an ongoing maintenance burden.
 */
const SERVICE_DATABASE_ENV_VARS: Record<string, string> = {
  identity: 'IDENTITY_DATABASE_URL',
  sales: 'SALES_DATABASE_URL',
  inventory: 'INVENTORY_DATABASE_URL',
  accounting: 'ACCOUNTING_DATABASE_URL',
  purchase: 'PURCHASE_DATABASE_URL',
  'master-data': 'MASTER_DATA_DATABASE_URL',
  production: 'PRODUCTION_DATABASE_URL',
};

/**
 * Resolves and sets process.env.DATABASE_URL for one service's host-side
 * startup (`nest start`/`node dist/.../main.js`), replacing the fragile,
 * inconsistent "if DATABASE_URL contains '/identity_db', string-replace
 * it" hack that used to live duplicated (and, for identity-service and
 * accounting-service, not present at all) across each service's own
 * main.ts.
 *
 * Precedence, intentionally in this order:
 *   1. The service's own explicit `<SERVICE>_DATABASE_URL` — always wins
 *      when present, even if a (possibly stale/ambiguous) DATABASE_URL is
 *      already set. This is what actually fixes the host-side ambiguity.
 *   2. An already-set `process.env.DATABASE_URL` — left untouched. This is
 *      exactly what Docker Compose already provides for every container
 *      (each container's DATABASE_URL is injected directly and correctly;
 *      none of them set a `<SERVICE>_DATABASE_URL`), so container startup
 *      is completely unaffected by this function existing.
 *   3. Neither is set anywhere (process env or the .env file) — throws a
 *      clear, specific error rather than letting Prisma/ConfigModule fail
 *      later with a generic "DATABASE_URL must be a string" validation
 *      error that doesn't say *why*.
 *
 * Must run before bootstrapHttpApp()/NestFactory.create(), since Prisma's
 * generated client resolves `env("DATABASE_URL")` at construction time
 * (during Nest's own module/provider instantiation) — by the time
 * ConfigModule's own `envFilePath` loading would otherwise run,
 * it would already be too late to change what Prisma sees. For the same
 * reason, this function loads the .env file itself (the same way
 * apps/identity-service/prisma/seed.ts already does) rather than relying
 * on ConfigModule to have done so first.
 */
export function resolveServiceDatabaseUrl(
  service: keyof typeof SERVICE_DATABASE_ENV_VARS,
  options: { envPath?: string } = {},
): void {
  const envPath = options.envPath ?? resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    // Non-destructive by default: never overrides a value already present
    // in process.env (e.g. injected directly by Docker Compose).
    loadDotenv({ path: envPath });
  }

  const varName = SERVICE_DATABASE_ENV_VARS[service];
  const explicit = process.env[varName];
  if (explicit) {
    process.env.DATABASE_URL = explicit;
    return;
  }

  if (process.env.DATABASE_URL) {
    return;
  }

  throw new Error(
    `Cannot start: neither ${varName} nor DATABASE_URL is set. ` +
      `Set ${varName} in .env (see .env.example) before running this service.`,
  );
}
