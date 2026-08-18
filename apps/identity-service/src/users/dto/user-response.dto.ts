import { User, UserStatus } from '../../../generated/prisma-client';

export class UserResponseDto {
  id!: string;
  tenantId!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  status!: UserStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
