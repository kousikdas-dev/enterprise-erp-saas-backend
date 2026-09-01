/** Matches Gateway identity DTO shapes — do not invent fields. */

/** Role name used to filter GET /v1/users?role=... for the Customer Salesperson picker. */
export const SALESPERSON_ROLE = 'Salesperson';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'LOCKED';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  status?: UserStatus;
}

export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

export interface UserRole {
  userId: string;
  roleId: string;
  tenantId: string;
  roleName: string;
  createdAt: string;
}

export interface UserRoleRemoved {
  userId: string;
  roleId: string;
  removed: true;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string | null;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface RoleRemoved extends Role {
  removed: true;
}

export interface ItemList<T> {
  items: T[];
}
