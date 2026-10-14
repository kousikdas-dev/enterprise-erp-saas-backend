import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Routing, RoutingStep } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { parseNonNegativeDecimal } from '../common/decimal';
import {
  InventoryProductClient,
  InventoryProductDetail,
} from '../inventory/inventory-product.client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toRoutingResponse } from './dto/routing-response';
import {
  CreateRoutingDto,
  CreateRoutingStepDto,
  UpdateRoutingDto,
} from './dto/routing.dto';

const MAX_VERSION_RETRIES = 5;

type RoutingWithSteps = Routing & { steps: RoutingStep[] };

interface MappedStep {
  data: Prisma.RoutingStepUncheckedCreateWithoutRoutingInput;
}

@Injectable()
export class RoutingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryProducts: InventoryProductClient,
  ) {}

  async create(actor: ActorContext, dto: CreateRoutingDto) {
    const product = await this.requireManufacturableProduct(
      actor,
      dto.productId,
      'Product',
    );
    const steps = await this.mapSteps(actor, dto.steps);
    this.assertEffectiveDateRange(dto.effectiveFrom, dto.effectiveTo);

    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
      const version = await this.nextVersion(actor, dto.productId);
      try {
        const row = await this.prisma.routing.create({
          data: {
            tenantId: actor.tenantId,
            productId: dto.productId,
            productSku: product.sku,
            productName: product.name,
            name: dto.name.trim(),
            version,
            status: 'DRAFT',
            description: dto.description?.trim() || null,
            effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
            effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            steps: { create: steps.map((step) => step.data) },
          },
          include: { steps: true },
        });
        return toRoutingResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_VERSION_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a Routing version');
  }

  async list(actor: ActorContext, productId?: string) {
    const rows = await this.prisma.routing.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(productId ? { productId } : {}),
      },
      orderBy: [{ productId: 'asc' }, { version: 'desc' }],
      include: { steps: true },
    });
    return { items: rows.map(toRoutingResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toRoutingResponse(await this.requireRouting(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateRoutingDto) {
    const routing = await this.requireRouting(actor, id);
    if (routing.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT routings can be edited');
    }

    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? new Date(dto.effectiveFrom)
        : routing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined ? new Date(dto.effectiveTo) : routing.effectiveTo;
    this.assertEffectiveDateRange(
      effectiveFrom?.toISOString(),
      effectiveTo?.toISOString(),
    );

    let steps: MappedStep[] | undefined;
    if (dto.steps) {
      steps = await this.mapSteps(actor, dto.steps);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (steps) {
        await tx.routingStep.deleteMany({ where: { routingId: id } });
      }
      return tx.routing.update({
        where: { id },
        data: {
          effectiveFrom,
          effectiveTo,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(steps
            ? { steps: { create: steps.map((step) => step.data) } }
            : {}),
        },
        include: { steps: true },
      });
    });
    return toRoutingResponse(row);
  }

  async activate(actor: ActorContext, id: string) {
    const routing = await this.requireRouting(actor, id);
    if (routing.status === 'ACTIVE') {
      throw new ConflictException('Routing is already ACTIVE');
    }
    if (routing.steps.length === 0) {
      throw new ConflictException(
        'At least one Routing Step is required to activate a Routing',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.routing.updateMany({
        where: {
          tenantId: actor.tenantId,
          productId: routing.productId,
          status: 'ACTIVE',
          NOT: { id },
        },
        data: { status: 'INACTIVE' },
      });
      return tx.routing.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: { steps: true },
      });
    });
    return toRoutingResponse(row);
  }

  async deactivate(actor: ActorContext, id: string) {
    const routing = await this.requireRouting(actor, id);
    if (routing.status !== 'ACTIVE') {
      throw new ConflictException('Only an ACTIVE Routing can be deactivated');
    }
    const row = await this.prisma.routing.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: { steps: true },
    });
    return toRoutingResponse(row);
  }

  async createNewVersion(actor: ActorContext, id: string) {
    const source = await this.requireRouting(actor, id);

    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
      const version = await this.nextVersion(actor, source.productId);
      try {
        const row = await this.prisma.routing.create({
          data: {
            tenantId: actor.tenantId,
            productId: source.productId,
            productSku: source.productSku,
            productName: source.productName,
            name: source.name,
            version,
            status: 'DRAFT',
            description: source.description,
            effectiveFrom: source.effectiveFrom,
            effectiveTo: source.effectiveTo,
            steps: {
              create: source.steps.map((step) => ({
                tenantId: actor.tenantId,
                operationId: step.operationId,
                operationCode: step.operationCode,
                operationName: step.operationName,
                workCentreId: step.workCentreId,
                workCentreCode: step.workCentreCode,
                workCentreName: step.workCentreName,
                setupMinutes: step.setupMinutes,
                runMinutesPerUnit: step.runMinutesPerUnit,
                description: step.description,
                sequence: step.sequence,
              })),
            },
          },
          include: { steps: true },
        });
        return toRoutingResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_VERSION_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a Routing version');
  }

  async remove(actor: ActorContext, id: string): Promise<{ id: string; removed: boolean }> {
    const routing = await this.requireRouting(actor, id);
    if (routing.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT routings can be deleted');
    }
    await this.prisma.routing.delete({ where: { id } });
    return { id, removed: true };
  }

  private async requireRouting(actor: ActorContext, id: string): Promise<RoutingWithSteps> {
    const row = await this.prisma.routing.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { steps: true },
    });
    if (!row) throw new NotFoundException('Routing not found');
    return row;
  }

  private async nextVersion(actor: ActorContext, productId: string): Promise<number> {
    const latest = await this.prisma.routing.findFirst({
      where: { tenantId: actor.tenantId, productId },
      orderBy: { version: 'desc' },
    });
    return (latest?.version ?? 0) + 1;
  }

  private assertEffectiveDateRange(
    effectiveFrom?: string | null,
    effectiveTo?: string | null,
  ): void {
    if (!effectiveFrom || !effectiveTo) return;
    if (new Date(effectiveTo).getTime() < new Date(effectiveFrom).getTime()) {
      throw new BadRequestException('effectiveTo must not be before effectiveFrom');
    }
  }

  private async requireManufacturableProduct(
    actor: ActorContext,
    productId: string,
    label: string,
  ): Promise<InventoryProductDetail> {
    const product = await this.inventoryProducts.getProductDetail(actor, productId);
    if (!product.isActive) {
      throw new ConflictException(`${label} is not active`);
    }
    if (!product.trackInventory) {
      throw new ConflictException(`${label} is not inventory-tracked`);
    }
    return product;
  }

  /**
   * Operations and Work Centres are this service's own master data (unlike
   * Product, which is cross-service), so resolution is a plain local Prisma
   * lookup rather than InventoryProductClient. Rejects unknown/inactive
   * operation or work centre ids, and duplicate `sequence` numbers — but
   * NOT duplicate (operation, work centre) pairs or repeated operations: a
   * routing may legitimately visit the same operation more than once (e.g.
   * Weld -> Inspect -> Weld).
   */
  private async mapSteps(
    actor: ActorContext,
    steps: CreateRoutingStepDto[] | undefined,
  ): Promise<MappedStep[]> {
    if (!steps || steps.length === 0) {
      return [];
    }
    const seenSequences = new Set<number>();
    const mapped: MappedStep[] = [];
    for (const step of steps) {
      if (seenSequences.has(step.sequence)) {
        throw new BadRequestException(
          `Duplicate sequence ${step.sequence} in Routing Steps`,
        );
      }
      seenSequences.add(step.sequence);

      const operation = await this.prisma.operation.findFirst({
        where: { id: step.operationId, tenantId: actor.tenantId },
      });
      if (!operation) {
        throw new BadRequestException(`Operation ${step.operationId} was not found`);
      }
      if (!operation.isActive) {
        throw new ConflictException(`Operation ${operation.code} is not active`);
      }

      const workCentre = await this.prisma.workCentre.findFirst({
        where: { id: step.workCentreId, tenantId: actor.tenantId },
      });
      if (!workCentre) {
        throw new BadRequestException(`Work centre ${step.workCentreId} was not found`);
      }
      if (!workCentre.isActive) {
        throw new ConflictException(`Work centre ${workCentre.code} is not active`);
      }

      const runMinutesPerUnit = parseNonNegativeDecimal(
        step.runMinutesPerUnit ?? '0',
        'runMinutesPerUnit',
      );
      const setupMinutes = step.setupMinutes ?? 0;

      mapped.push({
        data: {
          tenantId: actor.tenantId,
          operationId: step.operationId,
          operationCode: operation.code,
          operationName: operation.name,
          workCentreId: step.workCentreId,
          workCentreCode: workCentre.code,
          workCentreName: workCentre.name,
          setupMinutes,
          runMinutesPerUnit,
          description: step.description?.trim() || null,
          sequence: step.sequence,
        },
      });
    }
    return mapped;
  }
}
