import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Bom, BomItem, Prisma } from '../../generated/prisma-client';
import { ActorContext } from '../auth/actor-context';
import { parsePercent, parsePositiveDecimal } from '../common/decimal';
import {
  InventoryProductClient,
  InventoryProductDetail,
} from '../inventory/inventory-product.client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toBomResponse } from './dto/bom-response';
import { CreateBomDto, CreateBomItemDto, UpdateBomDto } from './dto/bom.dto';

const MAX_VERSION_RETRIES = 5;

type BomWithItems = Bom & { items: BomItem[] };

interface MappedItem {
  data: Prisma.BomItemUncheckedCreateWithoutBomInput;
  componentProductId: string;
}

@Injectable()
export class BillOfMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryProducts: InventoryProductClient,
  ) {}

  async create(actor: ActorContext, dto: CreateBomDto) {
    const parent = await this.requireManufacturableProduct(
      actor,
      dto.parentProductId,
      'Parent product',
    );
    const bomQuantity = parsePositiveDecimal(dto.bomQuantity);
    const outputUom = this.resolveUom(parent, dto.outputUnitOfMeasureId, 'parent product');
    const items = await this.mapItems(actor, dto.parentProductId, dto.items);
    this.assertEffectiveDateRange(dto.effectiveFrom, dto.effectiveTo);
    await this.assertNoCycle(
      actor,
      dto.parentProductId,
      items.map((item) => item.componentProductId),
    );

    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
      const version = await this.nextVersion(actor, dto.parentProductId);
      try {
        const row = await this.prisma.bom.create({
          data: {
            tenantId: actor.tenantId,
            parentProductId: dto.parentProductId,
            parentProductSku: parent.sku,
            parentProductName: parent.name,
            bomQuantity,
            outputUnitOfMeasureId: outputUom.unitOfMeasureId,
            outputUomCode: outputUom.code,
            outputUomName: outputUom.name,
            version,
            status: 'DRAFT',
            effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
            effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            notes: dto.notes?.trim() || null,
            items: { create: items.map((item) => item.data) },
          },
          include: { items: true },
        });
        return toBomResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_VERSION_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a BOM version');
  }

  async list(actor: ActorContext, parentProductId?: string) {
    const rows = await this.prisma.bom.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(parentProductId ? { parentProductId } : {}),
      },
      orderBy: [{ parentProductId: 'asc' }, { version: 'desc' }],
      include: { items: true },
    });
    return { items: rows.map(toBomResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toBomResponse(await this.requireBom(actor, id));
  }

  async update(actor: ActorContext, id: string, dto: UpdateBomDto) {
    const bom = await this.requireBom(actor, id);
    if (bom.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT BOMs can be edited');
    }

    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? new Date(dto.effectiveFrom)
        : bom.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined ? new Date(dto.effectiveTo) : bom.effectiveTo;
    this.assertEffectiveDateRange(
      effectiveFrom?.toISOString(),
      effectiveTo?.toISOString(),
    );

    const bomQuantity =
      dto.bomQuantity !== undefined
        ? parsePositiveDecimal(dto.bomQuantity)
        : undefined;

    let outputUom: { unitOfMeasureId: string; code: string; name: string } | undefined;
    if (dto.outputUnitOfMeasureId !== undefined) {
      const parent = await this.requireManufacturableProduct(
        actor,
        bom.parentProductId,
        'Parent product',
      );
      outputUom = this.resolveUom(parent, dto.outputUnitOfMeasureId, 'parent product');
    }

    let items: MappedItem[] | undefined;
    if (dto.items) {
      items = await this.mapItems(actor, bom.parentProductId, dto.items);
      await this.assertNoCycle(
        actor,
        bom.parentProductId,
        items.map((item) => item.componentProductId),
        id,
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.bomItem.deleteMany({ where: { bomId: id } });
      }
      return tx.bom.update({
        where: { id },
        data: {
          effectiveFrom,
          effectiveTo,
          ...(bomQuantity !== undefined ? { bomQuantity } : {}),
          ...(outputUom
            ? {
                outputUnitOfMeasureId: outputUom.unitOfMeasureId,
                outputUomCode: outputUom.code,
                outputUomName: outputUom.name,
              }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          ...(items
            ? { items: { create: items.map((item) => item.data) } }
            : {}),
        },
        include: { items: true },
      });
    });
    return toBomResponse(row);
  }

  async activate(actor: ActorContext, id: string) {
    const bom = await this.requireBom(actor, id);
    if (bom.status === 'ACTIVE') {
      throw new ConflictException('BOM is already ACTIVE');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.bom.updateMany({
        where: {
          tenantId: actor.tenantId,
          parentProductId: bom.parentProductId,
          status: 'ACTIVE',
          NOT: { id },
        },
        data: { status: 'INACTIVE' },
      });
      return tx.bom.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: { items: true },
      });
    });
    return toBomResponse(row);
  }

  async deactivate(actor: ActorContext, id: string) {
    const bom = await this.requireBom(actor, id);
    if (bom.status !== 'ACTIVE') {
      throw new ConflictException('Only an ACTIVE BOM can be deactivated');
    }
    const row = await this.prisma.bom.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: { items: true },
    });
    return toBomResponse(row);
  }

  async createNewVersion(actor: ActorContext, id: string) {
    const source = await this.requireBom(actor, id);

    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
      const version = await this.nextVersion(actor, source.parentProductId);
      try {
        const row = await this.prisma.bom.create({
          data: {
            tenantId: actor.tenantId,
            parentProductId: source.parentProductId,
            parentProductSku: source.parentProductSku,
            parentProductName: source.parentProductName,
            bomQuantity: source.bomQuantity,
            outputUnitOfMeasureId: source.outputUnitOfMeasureId,
            outputUomCode: source.outputUomCode,
            outputUomName: source.outputUomName,
            version,
            status: 'DRAFT',
            effectiveFrom: source.effectiveFrom,
            effectiveTo: source.effectiveTo,
            notes: source.notes,
            items: {
              create: source.items.map((item) => ({
                tenantId: actor.tenantId,
                componentProductId: item.componentProductId,
                componentProductSku: item.componentProductSku,
                componentProductName: item.componentProductName,
                quantity: item.quantity,
                unitOfMeasureId: item.unitOfMeasureId,
                uomCode: item.uomCode,
                uomName: item.uomName,
                scrapPercentage: item.scrapPercentage,
                sequence: item.sequence,
              })),
            },
          },
          include: { items: true },
        });
        return toBomResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < MAX_VERSION_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a BOM version');
  }

  async remove(actor: ActorContext, id: string): Promise<{ id: string; removed: boolean }> {
    const bom = await this.requireBom(actor, id);
    if (bom.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT BOMs can be deleted');
    }
    await this.prisma.bom.delete({ where: { id } });
    return { id, removed: true };
  }

  private async requireBom(actor: ActorContext, id: string): Promise<BomWithItems> {
    const row = await this.prisma.bom.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('BOM not found');
    return row;
  }

  private async nextVersion(
    actor: ActorContext,
    parentProductId: string,
  ): Promise<number> {
    const latest = await this.prisma.bom.findFirst({
      where: { tenantId: actor.tenantId, parentProductId },
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

  private async mapItems(
    actor: ActorContext,
    parentProductId: string,
    items: CreateBomItemDto[],
  ): Promise<MappedItem[]> {
    const seen = new Set<string>();
    const mapped: MappedItem[] = [];
    for (const item of items) {
      if (item.componentProductId === parentProductId) {
        throw new ConflictException(
          'A BOM cannot reference its own parent product as a component',
        );
      }
      if (seen.has(item.componentProductId)) {
        throw new BadRequestException(
          `Duplicate component product ${item.componentProductId} in BOM items`,
        );
      }
      seen.add(item.componentProductId);

      const component = await this.requireManufacturableProduct(
        actor,
        item.componentProductId,
        'Component product',
      );
      const quantity = parsePositiveDecimal(item.quantity);
      const scrapPercentage = item.scrapPercentage
        ? parsePercent(item.scrapPercentage)
        : null;
      const uom = this.resolveUom(component, item.unitOfMeasureId);

      mapped.push({
        componentProductId: item.componentProductId,
        data: {
          tenantId: actor.tenantId,
          componentProductId: item.componentProductId,
          componentProductSku: component.sku,
          componentProductName: component.name,
          quantity,
          unitOfMeasureId: uom.unitOfMeasureId,
          uomCode: uom.code,
          uomName: uom.name,
          scrapPercentage,
          sequence: item.sequence,
        },
      });
    }
    return mapped;
  }

  private resolveUom(
    product: InventoryProductDetail,
    unitOfMeasureId: string,
    label = 'component product',
  ): { unitOfMeasureId: string; code: string; name: string } {
    if (product.base.unitOfMeasureId === unitOfMeasureId) {
      return product.base;
    }
    const alternative = product.alternatives.find(
      (alt) => alt.unitOfMeasureId === unitOfMeasureId,
    );
    if (!alternative) {
      throw new BadRequestException(
        `Unit of measure is not valid for ${label} ${product.sku}`,
      );
    }
    return alternative;
  }

  /**
   * Walks the production-service-local Bom/BomItem graph only — never
   * crosses into inventory-service — to reject a BOM that would let
   * parentProductId reach itself again through any chain of nested BOMs
   * (Cotton -> Yarn -> Fabric -> ... -> Cotton).
   */
  private async assertNoCycle(
    actor: ActorContext,
    parentProductId: string,
    componentProductIds: string[],
    excludeBomId?: string,
  ): Promise<void> {
    const visited = new Set<string>();
    const queue = [...componentProductIds];

    while (queue.length > 0) {
      const productId = queue.shift();
      if (!productId) continue;
      if (productId === parentProductId) {
        throw new ConflictException(
          'This BOM would create a circular reference',
        );
      }
      if (visited.has(productId)) continue;
      visited.add(productId);

      const childBoms = await this.prisma.bom.findMany({
        where: {
          tenantId: actor.tenantId,
          parentProductId: productId,
          ...(excludeBomId ? { NOT: { id: excludeBomId } } : {}),
        },
        include: { items: true },
      });
      for (const childBom of childBoms) {
        for (const childItem of childBom.items) {
          queue.push(childItem.componentProductId);
        }
      }
    }
  }
}
