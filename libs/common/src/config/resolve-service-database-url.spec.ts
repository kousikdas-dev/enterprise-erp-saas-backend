import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveServiceDatabaseUrl } from './resolve-service-database-url';

describe('resolveServiceDatabaseUrl', () => {
  const ORIGINAL_ENV = { ...process.env };
  let scratchEnvPath: string;

  beforeEach(() => {
    // Start every test from a clean slate — none of the *_DATABASE_URL
    // keys or the legacy DATABASE_URL carry over between tests.
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.IDENTITY_DATABASE_URL;
    delete process.env.SALES_DATABASE_URL;
    delete process.env.INVENTORY_DATABASE_URL;
    delete process.env.ACCOUNTING_DATABASE_URL;
    delete process.env.PURCHASE_DATABASE_URL;
    delete process.env.MASTER_DATA_DATABASE_URL;
    delete process.env.PRODUCTION_DATABASE_URL;
    // A guaranteed-nonexistent .env path for tests that must not read
    // (or be able to read) the real repo .env.
    scratchEnvPath = join(tmpdir(), `resolve-service-db-url-${process.pid}-${Date.now()}.env`);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the explicit service-specific variable when process.env already has it', () => {
    process.env.INVENTORY_DATABASE_URL = 'postgresql://u:p@localhost:15432/inventory_db?schema=public';
    resolveServiceDatabaseUrl('inventory', { envPath: scratchEnvPath });
    expect(process.env.DATABASE_URL).toBe('postgresql://u:p@localhost:15432/inventory_db?schema=public');
  });

  it('conflicting legacy/service-specific variables: the explicit service variable wins over a stale legacy DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:15432/sales_db?schema=public'; // stale/wrong
    process.env.INVENTORY_DATABASE_URL = 'postgresql://u:p@localhost:15432/inventory_db?schema=public';
    resolveServiceDatabaseUrl('inventory', { envPath: scratchEnvPath });
    expect(process.env.DATABASE_URL).toBe('postgresql://u:p@localhost:15432/inventory_db?schema=public');
  });

  it('Docker Compose compatibility: falls back to an already-set DATABASE_URL when no service-specific variable exists', () => {
    // This is exactly the container shape: DATABASE_URL injected directly,
    // no *_DATABASE_URL present at all.
    process.env.DATABASE_URL = 'postgresql://u:p@postgres:5432/inventory_db?schema=public';
    resolveServiceDatabaseUrl('inventory', { envPath: scratchEnvPath });
    expect(process.env.DATABASE_URL).toBe('postgresql://u:p@postgres:5432/inventory_db?schema=public');
  });

  it('missing configuration: throws a clear, specific error naming the exact missing variable when neither is set', () => {
    expect(() => resolveServiceDatabaseUrl('inventory', { envPath: scratchEnvPath })).toThrow(
      /INVENTORY_DATABASE_URL/,
    );
    expect(() => resolveServiceDatabaseUrl('inventory', { envPath: scratchEnvPath })).toThrow(
      /neither .* nor DATABASE_URL is set/i,
    );
  });

  it('missing configuration: does not mutate DATABASE_URL when it throws', () => {
    try {
      resolveServiceDatabaseUrl('accounting', { envPath: scratchEnvPath });
    } catch {
      // expected
    }
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it('reads the service-specific variable from an .env-shaped file when process.env does not have it', () => {
    writeFileSync(
      scratchEnvPath,
      'PRODUCTION_DATABASE_URL=postgresql://u:p@localhost:15432/production_db?schema=public\r\n',
    );
    try {
      resolveServiceDatabaseUrl('production', { envPath: scratchEnvPath });
      expect(process.env.DATABASE_URL).toBe(
        'postgresql://u:p@localhost:15432/production_db?schema=public',
      );
    } finally {
      unlinkSync(scratchEnvPath);
    }
  });

  it('process.env still takes precedence over the .env file value', () => {
    writeFileSync(
      scratchEnvPath,
      'PRODUCTION_DATABASE_URL=postgresql://u:p@localhost:15432/wrong_db?schema=public\r\n',
    );
    try {
      process.env.PRODUCTION_DATABASE_URL = 'postgresql://u:p@localhost:15432/production_db?schema=public';
      resolveServiceDatabaseUrl('production', { envPath: scratchEnvPath });
      expect(process.env.DATABASE_URL).toBe(
        'postgresql://u:p@localhost:15432/production_db?schema=public',
      );
    } finally {
      unlinkSync(scratchEnvPath);
    }
  });

  it('every one of the 7 services resolves independently to its own variable', () => {
    const cases: Array<[Parameters<typeof resolveServiceDatabaseUrl>[0], string]> = [
      ['identity', 'IDENTITY_DATABASE_URL'],
      ['sales', 'SALES_DATABASE_URL'],
      ['inventory', 'INVENTORY_DATABASE_URL'],
      ['accounting', 'ACCOUNTING_DATABASE_URL'],
      ['purchase', 'PURCHASE_DATABASE_URL'],
      ['master-data', 'MASTER_DATA_DATABASE_URL'],
      ['production', 'PRODUCTION_DATABASE_URL'],
    ];
    for (const [service, varName] of cases) {
      delete process.env.DATABASE_URL;
      process.env[varName] = `postgresql://u:p@localhost:15432/${service}_marker?schema=public`;
      resolveServiceDatabaseUrl(service, { envPath: scratchEnvPath });
      expect(process.env.DATABASE_URL).toBe(
        `postgresql://u:p@localhost:15432/${service}_marker?schema=public`,
      );
      delete process.env[varName];
    }
  });
});
