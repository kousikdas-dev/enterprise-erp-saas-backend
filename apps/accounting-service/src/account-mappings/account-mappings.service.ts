import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import {
  Account,
  AccountMappingPurpose,
} from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toAccountMapping } from './dto/account-mapping-response';
import {
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
} from './dto/account-mapping.dto';

const ACCOUNT_SELECT = { id: true, code: true, name: true };

// Purposes resolved once per tenant, always at externalRefId = "". Every
// other purpose (currently only PAYMENT_METHOD) is per-entity and requires
// a non-empty externalRefId — enforced in create() below.
const SINGLETON_PURPOSES: ReadonlySet<AccountMappingPurpose> = new Set([
  AccountMappingPurpose.PURCHASE_EXPENSE,
  AccountMappingPurpose.ACCOUNTS_PAYABLE,
  AccountMappingPurpose.INPUT_TAX,
]);

export interface ResolvedMappingAccount {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

@Injectable()
export class AccountMappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateAccountMappingDto,
    request?: RequestAuditMeta,
  ) {
    const purpose = dto.purpose as AccountMappingPurpose;
    const externalRefId = this.normalizeExternalRefId(purpose, dto.externalRefId);

    await this.requireAccount(actor, dto.accountId);

    try {
      const row = await this.prisma.accountMapping.create({
        data: {
          tenantId: actor.tenantId,
          purpose,
          externalRefId,
          accountId: dto.accountId,
        },
        include: { account: { select: ACCOUNT_SELECT } },
      });

      await this.audit.record({
        actor,
        action: 'account-mapping.created',
        resource: 'account-mapping',
        resourceId: row.id,
        metadata: { purpose: row.purpose, externalRefId: row.externalRefId },
        request,
      });

      return toAccountMapping(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A mapping for this purpose (and entity, if applicable) already exists',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.accountMapping.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ purpose: 'asc' }, { externalRefId: 'asc' }],
      include: { account: { select: ACCOUNT_SELECT } },
    });

    return { items: rows.map(toAccountMapping) };
  }

  async getById(actor: ActorContext, id: string) {
    return toAccountMapping(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateAccountMappingDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    await this.requireAccount(actor, dto.accountId);

    const row = await this.prisma.accountMapping.update({
      where: { id },
      data: { accountId: dto.accountId },
      include: { account: { select: ACCOUNT_SELECT } },
    });

    await this.audit.record({
      actor,
      action: 'account-mapping.updated',
      resource: 'account-mapping',
      resourceId: row.id,
      metadata: { accountId: row.accountId },
      request,
    });

    return toAccountMapping(row);
  }

  async remove(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    await this.require(actor, id);

    const row = await this.prisma.accountMapping.delete({ where: { id } });

    await this.audit.record({
      actor,
      action: 'account-mapping.deleted',
      resource: 'account-mapping',
      resourceId: row.id,
      metadata: { purpose: row.purpose, externalRefId: row.externalRefId },
      request,
    });

    return { success: true, id: row.id };
  }

  /**
   * Internal resolution used by journal-postings: looks up the account for
   * one (purpose, externalRefId) pair. Never fabricates or falls back to a
   * different mapping — an unmapped purpose/entity throws, exactly per the
   * approved "no fallback account is allowed" design (this applies
   * uniformly to every purpose, not only PAYMENT_METHOD: a missing
   * tenant-wide singleton is just as much a configuration gap as a missing
   * per-entity mapping).
   */
  async resolve(
    actor: ActorContext,
    purpose: AccountMappingPurpose,
    externalRefId = '',
  ): Promise<ResolvedMappingAccount> {
    const row = await this.prisma.accountMapping.findFirst({
      where: { tenantId: actor.tenantId, purpose, externalRefId },
      include: { account: { select: { ...ACCOUNT_SELECT, isActive: true } } },
    });

    if (!row) {
      const suffix = externalRefId ? ` for "${externalRefId}"` : '';
      throw new BadRequestException(
        `No account mapping configured for ${purpose}${suffix}`,
      );
    }

    return row.account;
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.accountMapping.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { account: { select: ACCOUNT_SELECT } },
    });

    if (!row) {
      throw new NotFoundException('Account mapping not found');
    }

    return row;
  }

  private async requireAccount(
    actor: ActorContext,
    accountId: string,
  ): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, tenantId: actor.tenantId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  private normalizeExternalRefId(
    purpose: AccountMappingPurpose,
    externalRefId: string | undefined,
  ): string {
    const trimmed = externalRefId?.trim() || '';

    if (SINGLETON_PURPOSES.has(purpose)) {
      if (trimmed) {
        throw new BadRequestException(
          `${purpose} is a tenant-wide mapping and must not specify externalRefId`,
        );
      }
      return '';
    }

    if (!trimmed) {
      throw new BadRequestException(
        `${purpose} requires externalRefId (the entity this mapping is for)`,
      );
    }
    return trimmed;
  }
}
