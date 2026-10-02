import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkCentre } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toWorkCentreResponse } from './dto/work-centre-response';
import { CreateWorkCentreDto, UpdateWorkCentreDto } from './dto/work-centre.dto';

@Injectable()
export class WorkCentresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: ActorContext, dto: CreateWorkCentreDto) {
    try {
      const row = await this.prisma.workCentre.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
        },
      });
      return toWorkCentreResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Work centre code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.workCentre.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toWorkCentreResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toWorkCentreResponse(await this.require(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateWorkCentreDto) {
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
      const row = await this.prisma.workCentre.update({ where: { id }, data });
      return toWorkCentreResponse(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Work centre code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async activate(actor: ActorContext, id: string) {
    const workCentre = await this.require(actor, id);
    if (workCentre.isActive) {
      throw new ConflictException('Work centre is already active');
    }
    const row = await this.prisma.workCentre.update({
      where: { id },
      data: { isActive: true },
    });
    return toWorkCentreResponse(row);
  }

  async deactivate(actor: ActorContext, id: string) {
    const workCentre = await this.require(actor, id);
    if (!workCentre.isActive) {
      throw new ConflictException('Work centre is already inactive');
    }
    const row = await this.prisma.workCentre.update({
      where: { id },
      data: { isActive: false },
    });
    return toWorkCentreResponse(row);
  }

  async remove(
    actor: ActorContext,
    id: string,
  ): Promise<{ id: string; removed: boolean }> {
    // No entity references WorkCentre yet (Manufacturing Routing doesn't
    // exist). Once Routing is built, add a reference check here — Routing
    // step records should block deletion the same way BOM blocks deleting a
    // non-DRAFT version, rather than cascading.
    await this.require(actor, id);
    await this.prisma.workCentre.delete({ where: { id } });
    return { id, removed: true };
  }

  private async require(actor: ActorContext, id: string): Promise<WorkCentre> {
    const row = await this.prisma.workCentre.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Work centre not found');
    return row;
  }
}
