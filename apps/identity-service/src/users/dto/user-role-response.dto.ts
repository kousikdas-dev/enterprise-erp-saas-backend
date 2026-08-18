export class UserRoleResponseDto {
  userId!: string;
  roleId!: string;
  tenantId!: string;
  roleName!: string;
  createdAt!: Date;
}

export class UserRoleRemovedDto {
  userId!: string;
  roleId!: string;
  removed!: true;
}
