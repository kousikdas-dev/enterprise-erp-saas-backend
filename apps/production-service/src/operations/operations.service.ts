import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Operation } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toOperationResponse } from './dto/operation-response';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: ActorContext, dto: CreateOperationDto) {
    try {
      const row = await this.prisma.operation.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
      });
      return toOperationResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Operation code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.operation.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toOperationResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toOperationResponse(await this.require(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateOperationDto) {
    await this.require(actor, id);
    const data: { code?: string; name?: string; description?: string | null } =
      {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.operation.update({ where: { id }, data });
      return toOperationResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Operation code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async activate(actor: ActorContext, id: string) {
    const operation = await this.require(actor, id);
    if (operation.isActive) {
      throw new ConflictException('Operation is already active');
    }
    const row = await this.prisma.operation.update({
      where: { id },
      data: { isActive: true },
    });
    return toOperationResponse(row);
  }

  async deactivate(actor: ActorContext, id: string) {
    const operation = await this.require(actor, id);
    if (!operation.isActive) {
      throw new ConflictException('Operation is already inactive');
    }
    const row = await this.prisma.operation.update({
      where: { id },
      data: { isActive: false },
    });
    return toOperationResponse(row);
  }

  async remove(
    actor: ActorContext,
    id: string,
  ): Promise<{ id: string; removed: boolean }> {
    // No entity references Operation yet (Manufacturing Routing doesn't
    // exist). Once Routing is built, add a reference check here — Routing
    // step records should block deletion the same way BOM blocks deleting a
    // non-DRAFT version, rather than cascading.
    await this.require(actor, id);
    await this.prisma.operation.delete({ where: { id } });
    return { id, removed: true };
  }

  private async require(actor: ActorContext, id: string): Promise<Operation> {
    const row = await this.prisma.operation.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Operation not found');
    return row;
  }
}
