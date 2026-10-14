import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkOrder,
  WorkOrderStatus,
} from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toWorkOrderResponse } from './dto/work-order-response';
import { CreateWorkOrderDto, UpdateWorkOrderDto } from './dto/work-order.dto';

const MAX_NUMBER_RETRIES = 5;

export interface ListWorkOrdersQuery {
  productionOrderId?: string;
  workCentreId?: string;
  status?: WorkOrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: ActorContext, dto: CreateWorkOrderDto) {
    const order = await this.requireProductionOrder(actor, dto.productionOrderId);
    if (order.status === 'CANCELLED' || order.status === 'CLOSED') {
      throw new ConflictException(
        `Cannot add work orders to a ${order.status} production order`,
      );
    }
    const operation = await this.requireActiveOperation(actor, dto.operationId);
    const workCentre = await this.requireActiveWorkCentre(actor, dto.workCentreId);
    this.assertScheduleRange(dto.scheduledStartDate, dto.scheduledEndDate);

    for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt += 1) {
      const workOrderNumber = await this.nextWorkOrderNumber(actor.tenantId);
      try {
        const row = await this.prisma.workOrder.create({
          data: {
            tenantId: actor.tenantId,
            workOrderNumber,
            productionOrderId: order.id,
            productionOrderNumber: order.orderNumber,
            productId: order.productId,
            productSku: order.productSku,
            productName: order.productName,
            operationId: operation.id,
            operationCode: operation.code,
            operationName: operation.name,
            workCentreId: workCentre.id,
            workCentreCode: workCentre.code,
            workCentreName: workCentre.name,
            sequence: dto.sequence,
            plannedDurationMinutes: dto.plannedDurationMinutes,
            scheduledStartDate: dto.scheduledStartDate
              ? new Date(dto.scheduledStartDate)
              : null,
            scheduledEndDate: dto.scheduledEndDate
              ? new Date(dto.scheduledEndDate)
              : null,
            status: 'PENDING',
            notes: dto.notes?.trim() || null,
          },
        });
        return toWorkOrderResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_NUMBER_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a work order number');
  }

  async list(actor: ActorContext, query: ListWorkOrdersQuery = {}) {
    const page = query.page && query.page > 0 ? Math.floor(query.page) : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(Math.floor(query.pageSize), 500)
        : 200;

    const where: Prisma.WorkOrderWhereInput = { tenantId: actor.tenantId };
    if (query.productionOrderId) where.productionOrderId = query.productionOrderId;
    if (query.workCentreId) where.workCentreId = query.workCentreId;
    if (query.status) where.status = query.status;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { workOrderNumber: { contains: search, mode: 'insensitive' } },
        { productionOrderNumber: { contains: search, mode: 'insensitive' } },
        { productSku: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { operationName: { contains: search, mode: 'insensitive' } },
        { workCentreName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toWorkOrderResponse),
      total,
      page,
      pageSize,
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toWorkOrderResponse(await this.requireWorkOrder(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.requireWorkOrder(actor, id);
    if (workOrder.status === 'DONE' || workOrder.status === 'CANCELLED') {
      throw new ConflictException(
        `A ${workOrder.status} work order cannot be edited`,
      );
    }

    const data: Prisma.WorkOrderUpdateInput = {};

    if (dto.operationId !== undefined) {
      const operation = await this.requireActiveOperation(actor, dto.operationId);
      data.operationId = operation.id;
      data.operationCode = operation.code;
      data.operationName = operation.name;
    }
    if (dto.workCentreId !== undefined) {
      const workCentre = await this.requireActiveWorkCentre(actor, dto.workCentreId);
      data.workCentreId = workCentre.id;
      data.workCentreCode = workCentre.code;
      data.workCentreName = workCentre.name;
    }
    if (dto.sequence !== undefined) data.sequence = dto.sequence;
    if (dto.plannedDurationMinutes !== undefined) {
      data.plannedDurationMinutes = dto.plannedDurationMinutes;
    }

    const scheduledStartDate =
      dto.scheduledStartDate !== undefined
        ? new Date(dto.scheduledStartDate)
        : workOrder.scheduledStartDate;
    const scheduledEndDate =
      dto.scheduledEndDate !== undefined
        ? new Date(dto.scheduledEndDate)
        : workOrder.scheduledEndDate;
    this.assertScheduleRange(
      scheduledStartDate?.toISOString(),
      scheduledEndDate?.toISOString(),
    );
    if (dto.scheduledStartDate !== undefined) data.scheduledStartDate = scheduledStartDate;
    if (dto.scheduledEndDate !== undefined) data.scheduledEndDate = scheduledEndDate;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.prisma.workOrder.update({ where: { id }, data });
    return toWorkOrderResponse(row);
  }

  async remove(actor: ActorContext, id: string): Promise<{ id: string; removed: boolean }> {
    const workOrder = await this.requireWorkOrder(actor, id);
    if (workOrder.status !== 'PENDING') {
      throw new ConflictException('Only PENDING work orders can be deleted');
    }
    await this.prisma.workOrder.delete({ where: { id } });
    return { id, removed: true };
  }

  async start(actor: ActorContext, id: string) {
    return toWorkOrderResponse(
      await this.transition(actor, id, ['PENDING'], 'IN_PROGRESS'),
    );
  }

  async block(actor: ActorContext, id: string) {
    return toWorkOrderResponse(
      await this.transition(actor, id, ['IN_PROGRESS'], 'BLOCKED'),
    );
  }

  async unblock(actor: ActorContext, id: string) {
    return toWorkOrderResponse(
      await this.transition(actor, id, ['BLOCKED'], 'IN_PROGRESS'),
    );
  }

  async complete(actor: ActorContext, id: string) {
    return toWorkOrderResponse(
      await this.transition(actor, id, ['IN_PROGRESS', 'BLOCKED'], 'DONE'),
    );
  }

  async cancel(actor: ActorContext, id: string) {
    return toWorkOrderResponse(
      await this.transition(
        actor,
        id,
        ['PENDING', 'IN_PROGRESS', 'BLOCKED'],
        'CANCELLED',
      ),
    );
  }

  private async requireProductionOrder(actor: ActorContext, id: string) {
    const row = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Production order not found');
    return row;
  }

  private async requireActiveOperation(actor: ActorContext, id: string) {
    const row = await this.prisma.operation.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Operation not found');
    if (!row.isActive) throw new ConflictException('Operation is not active');
    return row;
  }

  private async requireActiveWorkCentre(actor: ActorContext, id: string) {
    const row = await this.prisma.workCentre.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Work centre not found');
    if (!row.isActive) throw new ConflictException('Work centre is not active');
    return row;
  }

  private async requireWorkOrder(actor: ActorContext, id: string): Promise<WorkOrder> {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Work order not found');
    return row;
  }

  /**
   * Same optimistic-transition guard as ProductionOrdersService.transition:
   * `updateMany`'s WHERE (including `status: { in: from }`) is evaluated
   * atomically by Postgres, so a concurrent transition that already moved
   * the row out of `from` makes `count` come back 0 instead of silently
   * overwriting it.
   */
  private async transition(
    actor: ActorContext,
    id: string,
    from: WorkOrderStatus[],
    to: WorkOrderStatus,
  ): Promise<WorkOrder> {
    await this.requireWorkOrder(actor, id);
    const result = await this.prisma.workOrder.updateMany({
      where: { id, tenantId: actor.tenantId, status: { in: from } },
      data: { status: to },
    });
    if (result.count === 0) {
      throw new ConflictException(
        `Only a work order in ${from.join('/')} can move to ${to}`,
      );
    }
    return this.requireWorkOrder(actor, id);
  }

  private assertScheduleRange(start?: string | null, end?: string | null): void {
    if (!start || !end) return;
    if (new Date(end).getTime() < new Date(start).getTime()) {
      throw new BadRequestException(
        'scheduledEndDate must not be before scheduledStartDate',
      );
    }
  }

  private async nextWorkOrderNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.workOrder.count({ where: { tenantId } });
    return `WO-${String(count + 1).padStart(6, '0')}`;
  }
}
