import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { parseRate } from '../common/decimal';
import { Prisma, TaxComponentType } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toTaxCode } from './dto/tax-code-response';
import {
  CreateTaxCodeDto,
  CreateTaxComponentDto,
  UpdateTaxCodeDto,
  UpdateTaxCodeStatusDto,
} from './dto/tax-code.dto';

const COMPONENT_ACCOUNT_SELECT = { id: true, code: true, name: true };
const TAX_CODE_INCLUDE = {
  components: {
    include: { account: { select: COMPONENT_ACCOUNT_SELECT } },
    orderBy: { sequence: 'asc' as const },
  },
};

interface PreparedComponent {
  sequence: number;
  type: TaxComponentType;
  name: string | null;
  rate: Prisma.Decimal;
  accountId: string | null;
}

@Injectable()
export class TaxCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateTaxCodeDto,
    request?: RequestAuditMeta,
  ) {
    const components = await this.prepareComponents(actor, dto.components);

    try {
      const row = await this.prisma.taxCode.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          components: {
            create: components.map((component) => ({
              tenantId: actor.tenantId,
              sequence: component.sequence,
              type: component.type,
              name: component.name,
              rate: component.rate,
              accountId: component.accountId,
            })),
          },
        },
        include: TAX_CODE_INCLUDE,
      });

      await this.audit.record({
        actor,
        action: 'tax-code.created',
        resource: 'tax-code',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name },
        request,
      });

      return toTaxCode(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Tax code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.taxCode.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
      include: TAX_CODE_INCLUDE,
    });

    return { items: rows.map(toTaxCode) };
  }

  async getById(actor: ActorContext, id: string) {
    return toTaxCode(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateTaxCodeDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);

    const data: {
      code?: string;
      name?: string;
      description?: string | null;
    } = {};

    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    const components =
      dto.components !== undefined
        ? await this.prepareComponents(actor, dto.components)
        : undefined;

    if (Object.keys(data).length === 0 && components === undefined) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.taxCode.update({ where: { id }, data });
        }

        if (components) {
          await tx.taxComponent.deleteMany({
            where: { taxCodeId: id, tenantId: actor.tenantId },
          });
          await tx.taxComponent.createMany({
            data: components.map((component) => ({
              tenantId: actor.tenantId,
              taxCodeId: id,
              sequence: component.sequence,
              type: component.type,
              name: component.name,
              rate: component.rate,
              accountId: component.accountId,
            })),
          });
        }

        return tx.taxCode.findFirst({
          where: { id, tenantId: actor.tenantId },
          include: TAX_CODE_INCLUDE,
        });
      });

      if (!row) {
        throw new NotFoundException('Tax code not found');
      }

      await this.audit.record({
        actor,
        action: 'tax-code.updated',
        resource: 'tax-code',
        resourceId: row.id,
        metadata: { ...data, componentCount: row.components.length },
        request,
      });

      return toTaxCode(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Tax code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async updateStatus(
    actor: ActorContext,
    id: string,
    dto: UpdateTaxCodeStatusDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    const row = await this.prisma.taxCode.update({
      where: { id: existing.id },
      data: { isActive: dto.isActive },
      include: TAX_CODE_INCLUDE,
    });

    await this.audit.record({
      actor,
      action: 'tax-code.status_changed',
      resource: 'tax-code',
      resourceId: row.id,
      metadata: { from: existing.isActive, to: row.isActive },
      request,
    });

    return toTaxCode(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.taxCode.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: TAX_CODE_INCLUDE,
    });

    if (!row) {
      throw new NotFoundException('Tax code not found');
    }

    return row;
  }

  private async prepareComponents(
    actor: ActorContext,
    componentDtos: CreateTaxComponentDto[],
  ): Promise<PreparedComponent[]> {
    const seenTypes = new Set<TaxComponentType>();
    const seenSequences = new Set<number>();
    let hasCgstOrSgst = false;
    let hasIgst = false;

    const parsed: PreparedComponent[] = componentDtos.map((dto) => {
      if (seenSequences.has(dto.sequence)) {
        throw new BadRequestException(
          `Duplicate sequence number in tax code components: ${dto.sequence}`,
        );
      }
      seenSequences.add(dto.sequence);

      const isRepeatable =
        dto.type === TaxComponentType.CESS ||
        dto.type === TaxComponentType.OTHER;

      if (!isRepeatable) {
        if (seenTypes.has(dto.type)) {
          throw new BadRequestException(
            `Duplicate tax component type in tax code: ${dto.type}`,
          );
        }
        seenTypes.add(dto.type);
      }

      if (dto.type === TaxComponentType.IGST) {
        hasIgst = true;
      }
      if (
        dto.type === TaxComponentType.CGST ||
        dto.type === TaxComponentType.SGST
      ) {
        hasCgstOrSgst = true;
      }

      return {
        sequence: dto.sequence,
        type: dto.type,
        name: dto.name?.trim() || null,
        rate: parseRate(dto.rate),
        accountId: dto.accountId ?? null,
      };
    });

    if (hasIgst && hasCgstOrSgst) {
      throw new BadRequestException(
        'IGST cannot be combined with CGST or SGST in the same tax code',
      );
    }

    const accountIds = [
      ...new Set(
        parsed
          .map((component) => component.accountId)
          .filter((accountId): accountId is string => accountId !== null),
      ),
    ];
    for (const accountId of accountIds) {
      await this.accounts.require(actor, accountId);
    }

    return parsed;
  }
}
