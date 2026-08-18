import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserStatus } from '../../generated/prisma-client';
import { ActorContext, RequestAuditMeta } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { CreateUserDto } from './dto/create-user.dto';
import { toUserResponse } from './dto/user-response.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateUserDto,
    request?: RequestAuditMeta,
  ) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: actor.tenantId,
            email,
            passwordHash,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            status: dto.status ?? UserStatus.ACTIVE,
          },
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: user.tenantId,
            action: 'user.created',
            resource: 'user',
            resourceId: user.id,
            metadata: {
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              status: user.status,
            },
            request,
          },
          tx,
        );
        return toUserResponse(user);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email already exists in this tenant');
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const users = await this.prisma.user.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { email: 'asc' },
    });
    return { items: users.map(toUserResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toUserResponse(await this.requireTenantUser(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateUserDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireTenantUser(actor, id);
    const data: {
      email?: string;
      firstName?: string;
      lastName?: string;
    } = {};
    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase();
    }
    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data,
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: updated.tenantId,
            action: 'user.updated',
            resource: 'user',
            resourceId: updated.id,
            metadata: data,
            request,
          },
          tx,
        );
        return updated;
      });
      return toUserResponse(user);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email already exists in this tenant');
      }
      throw error;
    }
  }

  async updateStatus(
    actor: ActorContext,
    id: string,
    dto: UpdateUserStatusDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireTenantUser(actor, id);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { status: dto.status },
      });
      await this.audit.record(
        {
          actor,
          resourceTenantId: updated.tenantId,
          action: 'user.status_changed',
          resource: 'user',
          resourceId: updated.id,
          metadata: { from: existing.status, to: updated.status },
          request,
        },
        tx,
      );
      return updated;
    });
    return toUserResponse(user);
  }

  async assignRole(
    actor: ActorContext,
    userId: string,
    roleId: string,
    request?: RequestAuditMeta,
  ) {
    const user = await this.requireTenantUser(actor, userId);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId: actor.tenantId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            tenantId: actor.tenantId,
          },
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: actor.tenantId,
            action: 'user.role_assigned',
            resource: 'user',
            resourceId: user.id,
            metadata: {
              userId: user.id,
              roleId: role.id,
              roleName: role.name,
            },
            request,
          },
          tx,
        );
        return {
          userId: assignment.userId,
          roleId: assignment.roleId,
          tenantId: assignment.tenantId,
          roleName: role.name,
          createdAt: assignment.createdAt,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Role already assigned to this user');
      }
      throw error;
    }
  }

  async removeRole(
    actor: ActorContext,
    userId: string,
    roleId: string,
    request?: RequestAuditMeta,
  ) {
    const user = await this.requireTenantUser(actor, userId);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId: actor.tenantId },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    const assignment = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
    });
    if (!assignment || assignment.tenantId !== actor.tenantId) {
      throw new NotFoundException('User role assignment not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.delete({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
      });
      await this.audit.record(
        {
          actor,
          resourceTenantId: actor.tenantId,
          action: 'user.role_removed',
          resource: 'user',
          resourceId: user.id,
          metadata: {
            userId: user.id,
            roleId: role.id,
            roleName: role.name,
          },
          request,
        },
        tx,
      );
    });
    return { userId: user.id, roleId: role.id, removed: true as const };
  }

  private async requireTenantUser(
    actor: ActorContext,
    id: string,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
