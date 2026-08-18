import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { permissionKey } from '@app/common';
import { ActorContext, RequestAuditMeta } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleWithPermissions, toRoleResponse } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_WITH_PERMISSIONS = {
  rolePermissions: { include: { permission: true } },
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateRoleDto,
    request?: RequestAuditMeta,
  ) {
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { tenantId: actor.tenantId, name, description },
          include: ROLE_WITH_PERMISSIONS,
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: actor.tenantId,
            action: 'role.created',
            resource: 'role',
            resourceId: role.id,
            metadata: { roleId: role.id, name: role.name, description },
            request,
          },
          tx,
        );
        return toRoleResponse(role);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Role name already exists in this tenant');
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: actor.tenantId },
      include: ROLE_WITH_PERMISSIONS,
      orderBy: { name: 'asc' },
    });
    return { items: roles.map(toRoleResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toRoleResponse(await this.requireTenantRole(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateRoleDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireTenantRole(actor, id);
    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.role.update({
          where: { id: existing.id },
          data,
          include: ROLE_WITH_PERMISSIONS,
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: actor.tenantId,
            action: 'role.updated',
            resource: 'role',
            resourceId: updated.id,
            metadata: { roleId: updated.id, ...data },
            request,
          },
          tx,
        );
        return toRoleResponse(updated);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Role name already exists in this tenant');
      }
      throw error;
    }
  }

  async assignPermission(
    actor: ActorContext,
    roleId: string,
    dto: AssignPermissionDto,
    request?: RequestAuditMeta,
  ) {
    const role = await this.requireTenantRole(actor, roleId);
    const permission = await this.prisma.permission.findUnique({
      where: { id: dto.permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
        const updated = await tx.role.findUniqueOrThrow({
          where: { id: role.id },
          include: ROLE_WITH_PERMISSIONS,
        });
        await this.audit.record(
          {
            actor,
            resourceTenantId: actor.tenantId,
            action: 'role.permission_assigned',
            resource: 'role',
            resourceId: role.id,
            metadata: {
              roleId: role.id,
              roleName: role.name,
              permissionId: permission.id,
              permission: permissionKey(permission.resource, permission.action),
            },
            request,
          },
          tx,
        );
        return toRoleResponse(updated);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Permission already assigned to this role');
      }
      throw error;
    }
  }

  async removePermission(
    actor: ActorContext,
    roleId: string,
    permissionId: string,
    request?: RequestAuditMeta,
  ) {
    const role = await this.requireTenantRole(actor, roleId);
    const assignment = await this.prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId },
      },
      include: { permission: true },
    });
    if (!assignment) {
      throw new NotFoundException('Role permission assignment not found');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
      });
      const updated = await tx.role.findUniqueOrThrow({
        where: { id: role.id },
        include: ROLE_WITH_PERMISSIONS,
      });
      await this.audit.record(
        {
          actor,
          resourceTenantId: actor.tenantId,
          action: 'role.permission_removed',
          resource: 'role',
          resourceId: role.id,
          metadata: {
            roleId: role.id,
            roleName: role.name,
            permissionId,
            permission: permissionKey(
              assignment.permission.resource,
              assignment.permission.action,
            ),
          },
          request,
        },
        tx,
      );
      return { ...toRoleResponse(updated), removed: true as const };
    });
  }

  private async requireTenantRole(
    actor: ActorContext,
    id: string,
  ): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: ROLE_WITH_PERMISSIONS,
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }
}
