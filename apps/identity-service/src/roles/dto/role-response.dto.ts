import { permissionKey } from '@app/common';
import { Permission, Role } from '../../../generated/prisma-client';

export class PermissionSummaryDto {
  id!: string;
  resource!: string;
  action!: string;
  key!: string;
  description!: string | null;
}

export class RoleResponseDto {
  id!: string;
  tenantId!: string;
  name!: string;
  description!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  permissions!: PermissionSummaryDto[];
}

export type RoleWithPermissions = Role & {
  rolePermissions: Array<{ permission: Permission }>;
};

export function toPermissionSummary(
  permission: Permission,
): PermissionSummaryDto {
  return {
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    key: permissionKey(permission.resource, permission.action),
    description: permission.description,
  };
}

export function toRoleResponse(role: RoleWithPermissions): RoleResponseDto {
  return {
    id: role.id,
    tenantId: role.tenantId,
    name: role.name,
    description: role.description,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.rolePermissions.map((link) =>
      toPermissionSummary(link.permission),
    ),
  };
}
