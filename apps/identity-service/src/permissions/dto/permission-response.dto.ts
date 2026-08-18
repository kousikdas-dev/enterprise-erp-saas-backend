import { permissionKey } from '@app/common';
import { Permission } from '../../../generated/prisma-client';

export function toPermissionResponse(permission: Permission) {
  return {
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    key: permissionKey(permission.resource, permission.action),
    description: permission.description,
  };
}
