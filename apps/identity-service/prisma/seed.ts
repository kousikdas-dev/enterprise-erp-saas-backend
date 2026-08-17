/**
 * DEVELOPMENT / LOCAL TEST ONLY.
 * Idempotent Identity seed: Demo tenant + one ACTIVE admin user.
 * Not an HTTP endpoint. Refuses to run when NODE_ENV=production.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PasswordService } from '../src/auth/password.service';
import {
  PrismaClient,
  TenantStatus,
  UserStatus,
} from '../generated/prisma-client';

config({ path: resolve(__dirname, '../../../.env') });

const TENANT_CODE = 'DEMO';
const TENANT_NAME = 'Demo Company';
const ADMIN_EMAIL = 'admin@demo.local';
const ADMIN_FIRST_NAME = 'System';
const ADMIN_LAST_NAME = 'Administrator';
const LOCAL_DEV_PASSWORD_DEFAULT = 'DevPassword123!';

async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error(
      'Identity seed is development-only and will not run when NODE_ENV=production.',
    );
  }

  const password =
    process.env.DEV_ADMIN_PASSWORD ??
    (nodeEnv === 'development' || nodeEnv === 'test'
      ? LOCAL_DEV_PASSWORD_DEFAULT
      : undefined);

  if (!password) {
    throw new Error(
      'DEV_ADMIN_PASSWORD must be set to seed the development admin user.',
    );
  }

  const prisma = new PrismaClient();
  const passwords = new PasswordService();

  try {
    const passwordHash = await passwords.hash(password);

    const tenant = await prisma.tenant.upsert({
      where: { code: TENANT_CODE },
      create: {
        name: TENANT_NAME,
        code: TENANT_CODE,
        status: TenantStatus.ACTIVE,
      },
      update: {
        name: TENANT_NAME,
        status: TenantStatus.ACTIVE,
      },
    });

    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: ADMIN_EMAIL,
        },
      },
      create: {
        tenantId: tenant.id,
        email: ADMIN_EMAIL,
        passwordHash,
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        status: UserStatus.ACTIVE,
      },
    });

    console.log(
      `Identity development seed complete: tenant=${tenant.code} user=${user.email} status=${user.status}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Identity development seed failed: ${message}`);
  process.exitCode = 1;
});
