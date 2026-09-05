import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toAccount } from './dto/account-response';
import {
  CreateAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from './dto/account.dto';

const PARENT_SELECT = { id: true, code: true, name: true };

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateAccountDto,
    request?: RequestAuditMeta,
  ) {
    if (dto.parentId) {
      await this.requireAccount(actor, dto.parentId);
    }

    try {
      const row = await this.prisma.account.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          parentId: dto.parentId ?? null,
          description: dto.description?.trim() || null,
        },
        include: { parent: { select: PARENT_SELECT } },
      });

      await this.audit.record({
        actor,
        action: 'account.created',
        resource: 'account',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name, type: row.type },
        request,
      });

      return toAccount(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Account code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.account.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
      include: { parent: { select: PARENT_SELECT } },
    });

    return {
      items: rows.map(toAccount),
    };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.account.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { parent: { select: PARENT_SELECT } },
    });

    if (!row) {
      throw new NotFoundException('Account not found');
    }

    return toAccount(row);
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateAccountDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);

    const data: {
      code?: string;
      name?: string;
      type?: UpdateAccountDto['type'];
      parentId?: string | null;
      description?: string | null;
    } = {};

    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.type !== undefined) {
      data.type = dto.type;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        data.parentId = null;
      } else {
        await this.assertNoCycle(actor, id, dto.parentId);
        data.parentId = dto.parentId;
      }
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const row = await this.prisma.account.update({
        where: { id },
        data,
        include: { parent: { select: PARENT_SELECT } },
      });

      await this.audit.record({
        actor,
        action: 'account.updated',
        resource: 'account',
        resourceId: row.id,
        metadata: data,
        request,
      });

      return toAccount(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Account code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async updateStatus(
    actor: ActorContext,
    id: string,
    dto: UpdateAccountStatusDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    const row = await this.prisma.account.update({
      where: { id: existing.id },
      data: { isActive: dto.isActive },
      include: { parent: { select: PARENT_SELECT } },
    });

    await this.audit.record({
      actor,
      action: 'account.status_changed',
      resource: 'account',
      resourceId: row.id,
      metadata: { from: existing.isActive, to: row.isActive },
      request,
    });

    return toAccount(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.account.findFirst({
      where: { id, tenantId: actor.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Account not found');
    }

    return row;
  }

  private async requireAccount(actor: ActorContext, id: string) {
    const row = await this.prisma.account.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true },
    });

    if (!row) {
      throw new NotFoundException('Parent account not found');
    }

    return row;
  }

  private async assertNoCycle(
    actor: ActorContext,
    id: string,
    parentId: string,
  ): Promise<void> {
    if (parentId === id) {
      throw new BadRequestException('An account cannot be its own parent');
    }

    let currentId: string | null = parentId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      const node: { id: string; parentId: string | null } | null =
        await this.prisma.account.findFirst({
          where: { id: currentId, tenantId: actor.tenantId },
          select: { id: true, parentId: true },
        });

      if (!node) {
        throw new NotFoundException('Parent account not found');
      }

      if (node.id === id) {
        throw new BadRequestException(
          'Parent account cannot be a descendant of this account',
        );
      }

      currentId = node.parentId;
    }
  }
}
