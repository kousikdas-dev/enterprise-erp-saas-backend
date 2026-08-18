/**
 * DEVELOPMENT / LOCAL TEST ONLY.
 * Idempotent Identity seed: Demo tenant, admin, RBAC probe + management
 * permissions, a DEMO viewer without those permissions, and an OTHER tenant
 * user for isolation tests. Not an HTTP endpoint. Refuses NODE_ENV=production.
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

const MANAGEMENT_PERMISSIONS: Array<{
  resource: string;
  action: string;
  description: string;
}> = [
  { resource: 'rbac', action: 'test', description: 'Development RBAC probe' },
  { resource: 'tenants', action: 'read', description: 'Read tenant records' },
  { resource: 'tenants', action: 'create', description: 'Create tenants' },
  {
    resource: 'tenants',
    action: 'update',
    description: 'Update tenant records',
  },
  {
    resource: 'tenants',
    action: 'status',
    description: 'Change tenant status',
  },
  { resource: 'users', action: 'read', description: 'Read users' },
  { resource: 'users', action: 'create', description: 'Create users' },
  { resource: 'users', action: 'update', description: 'Update users' },
  { resource: 'users', action: 'status', description: 'Change user status' },
  {
    resource: 'users',
    action: 'roles',
    description: 'Assign and remove user roles',
  },
  { resource: 'roles', action: 'read', description: 'Read roles' },
  { resource: 'roles', action: 'create', description: 'Create roles' },
  { resource: 'roles', action: 'update', description: 'Update roles' },
  {
    resource: 'roles',
    action: 'status',
    description: 'Change role status',
  },
  {
    resource: 'roles',
    action: 'permissions',
    description: 'Assign and remove role permissions',
  },
  {
    resource: 'permissions',
    action: 'read',
    description: 'Read the permission catalog',
  },
  { resource: 'products', action: 'create', description: 'Create products' },
  { resource: 'products', action: 'read', description: 'Read products' },
  { resource: 'products', action: 'update', description: 'Update products' },
  {
    resource: 'categories',
    action: 'create',
    description: 'Create categories',
  },
  { resource: 'categories', action: 'read', description: 'Read categories' },
  {
    resource: 'categories',
    action: 'update',
    description: 'Update categories',
  },
  {
    resource: 'units',
    action: 'create',
    description: 'Create units of measure',
  },
  { resource: 'units', action: 'read', description: 'Read units of measure' },
  {
    resource: 'units',
    action: 'update',
    description: 'Update units of measure',
  },
  {
    resource: 'warehouses',
    action: 'create',
    description: 'Create warehouses',
  },
  { resource: 'warehouses', action: 'read', description: 'Read warehouses' },
  {
    resource: 'warehouses',
    action: 'update',
    description: 'Update warehouses',
  },
  { resource: 'stock', action: 'read', description: 'Read stock balances' },
  {
    resource: 'stock',
    action: 'adjust',
    description: 'Adjust stock quantities',
  },
  {
    resource: 'stock.movements',
    action: 'read',
    description: 'Read stock movement history',
  },
];

async function seedSuperAdminPermissions(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
): Promise<void> {
  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: 'SUPER_ADMIN' } },
    create: {
      tenantId,
      name: 'SUPER_ADMIN',
      description: 'Development super-admin',
    },
    update: { description: 'Development super-admin' },
  });

  for (const item of MANAGEMENT_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: { resource: item.resource, action: item.action },
      },
      create: item,
      update: { description: item.description },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      create: { roleId: adminRole.id, permissionId: permission.id },
      update: {},
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUserId, roleId: adminRole.id } },
    create: { userId: adminUserId, roleId: adminRole.id, tenantId },
    update: { tenantId },
  });
}

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

    await seedSuperAdminPermissions(prisma, tenant.id, user.id);

    await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email: 'viewer@demo.local' },
      },
      create: {
        tenantId: tenant.id,
        email: 'viewer@demo.local',
        passwordHash,
        firstName: 'Demo',
        lastName: 'Viewer',
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        firstName: 'Demo',
        lastName: 'Viewer',
        status: UserStatus.ACTIVE,
      },
    });

    const otherTenant = await prisma.tenant.upsert({
      where: { code: 'OTHER' },
      create: {
        name: 'Other Company',
        code: 'OTHER',
        status: TenantStatus.ACTIVE,
      },
      update: { name: 'Other Company', status: TenantStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: otherTenant.id,
          email: 'admin@other.local',
        },
      },
      create: {
        tenantId: otherTenant.id,
        email: 'admin@other.local',
        passwordHash,
        firstName: 'Other',
        lastName: 'Admin',
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        firstName: 'Other',
        lastName: 'Admin',
        status: UserStatus.ACTIVE,
      },
    });

    console.log(
      `Identity development seed complete: tenant=${tenant.code} user=${user.email} status=${user.status}`,
    );
    console.log(
      'Identity RBAC seed: SUPER_ADMIN has rbac.test, tenant/user/role management, permissions.read, and Inventory V1 permissions; viewer and OTHER remain unprivileged',
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
