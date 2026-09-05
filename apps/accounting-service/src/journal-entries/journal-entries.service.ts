import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { moneyToString, parseMoney } from '../common/decimal';
import { JournalEntryStatus, Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toJournalEntryResponse } from './dto/journal-entry-response';
import {
  CreateJournalEntryDto,
  CreateJournalLineDto,
  UpdateJournalEntryDto,
} from './dto/journal-entry.dto';

const ACCOUNT_SELECT = { id: true, code: true, name: true };
const ENTRY_INCLUDE = {
  lines: {
    include: { account: { select: ACCOUNT_SELECT } },
    orderBy: { lineNumber: 'asc' as const },
  },
};

interface PreparedLine {
  lineNumber: number;
  accountId: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  description: string | null;
}

@Injectable()
export class JournalEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateJournalEntryDto,
    request?: RequestAuditMeta,
  ) {
    const lines = await this.prepareLines(actor, dto.lines ?? []);
    const entryDate = dto.entryDate ? new Date(dto.entryDate) : new Date();
    const description = dto.description?.trim() || null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const entryNumber = await this.nextEntryNumber(actor.tenantId);
      try {
        const row = await this.prisma.journalEntry.create({
          data: {
            tenantId: actor.tenantId,
            entryNumber,
            entryDate,
            description,
            status: JournalEntryStatus.DRAFT,
            lines: {
              create: lines.map((line) => ({
                tenantId: actor.tenantId,
                lineNumber: line.lineNumber,
                accountId: line.accountId,
                debitAmount: line.debitAmount,
                creditAmount: line.creditAmount,
                description: line.description,
              })),
            },
          },
          include: ENTRY_INCLUDE,
        });

        await this.audit.record({
          actor,
          action: 'journal-entry.created',
          resource: 'journal-entry',
          resourceId: row.id,
          metadata: {
            entryNumber: row.entryNumber,
            lineCount: row.lines.length,
          },
          request,
        });

        return toJournalEntryResponse(row);
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate journal entry number');
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.journalEntry.findMany({
      where: { tenantId: actor.tenantId },
      include: ENTRY_INCLUDE,
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });

    return { items: rows.map(toJournalEntryResponse) };
  }

  async getById(actor: ActorContext, id: string) {
    return toJournalEntryResponse(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateJournalEntryDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.require(actor, id);

    if (existing.status !== JournalEntryStatus.DRAFT) {
      throw new ConflictException('Only DRAFT journal entries can be updated');
    }

    if (
      dto.entryDate === undefined &&
      dto.description === undefined &&
      dto.lines === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }

    const headerData: { entryDate?: Date; description?: string | null } = {};
    if (dto.entryDate !== undefined) {
      headerData.entryDate = new Date(dto.entryDate);
    }
    if (dto.description !== undefined) {
      headerData.description = dto.description?.trim() || null;
    }

    const lines =
      dto.lines !== undefined
        ? await this.prepareLines(actor, dto.lines)
        : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      // Row-level lock (same pattern already used in
      // shipments.service.ts::finalizePosted): SELECT ... FOR UPDATE both
      // locks this row for the remainder of the transaction — blocking a
      // concurrent post()'s UPDATE until we commit or roll back — and
      // re-reads its current status past any lock wait, instead of trusting
      // the status read before this transaction started.
      //
      // updateMany({ data: {} }) cannot be used for this guard: Prisma treats
      // an empty `data` as a no-op and never issues a query at all (it always
      // returns { count: 0 } without touching the row or the database), so it
      // neither locks the row nor detects a race for a lines-only PATCH
      // (headerData is `{}` whenever only `lines` is supplied).
      const lockedRows = await tx.$queryRaw<Array<{ status: string }>>(
        Prisma.sql`SELECT status::text AS status FROM "journal_entries" WHERE id = ${id}::uuid AND "tenantId" = ${actor.tenantId}::uuid FOR UPDATE`,
      );
      const locked = lockedRows[0];

      if (!locked || locked.status !== JournalEntryStatus.DRAFT) {
        throw new ConflictException(
          'Only DRAFT journal entries can be updated',
        );
      }

      if (Object.keys(headerData).length > 0) {
        await tx.journalEntry.update({
          where: { id },
          data: headerData,
        });
      }

      if (lines) {
        await tx.journalLine.deleteMany({
          where: { journalEntryId: id, tenantId: actor.tenantId },
        });
        await tx.journalLine.createMany({
          data: lines.map((line) => ({
            tenantId: actor.tenantId,
            journalEntryId: id,
            lineNumber: line.lineNumber,
            accountId: line.accountId,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description,
          })),
        });
      }

      return tx.journalEntry.findFirst({
        where: { id, tenantId: actor.tenantId },
        include: ENTRY_INCLUDE,
      });
    });

    if (!row) {
      throw new NotFoundException('Journal entry not found');
    }

    await this.audit.record({
      actor,
      action: 'journal-entry.updated',
      resource: 'journal-entry',
      resourceId: row.id,
      metadata: { entryNumber: row.entryNumber, lineCount: row.lines.length },
      request,
    });

    return toJournalEntryResponse(row);
  }

  async post(actor: ActorContext, id: string, request?: RequestAuditMeta) {
    const existing = await this.require(actor, id);

    if (existing.status !== JournalEntryStatus.DRAFT) {
      throw new ConflictException('Only DRAFT journal entries can be posted');
    }

    if (existing.lines.length < 2) {
      throw new BadRequestException(
        'Journal entry must contain at least 2 lines',
      );
    }

    const accountIds = new Set<string>();
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const line of existing.lines) {
      const hasDebit = line.debitAmount.greaterThan(0);
      const hasCredit = line.creditAmount.greaterThan(0);
      if (
        line.debitAmount.lessThan(0) ||
        line.creditAmount.lessThan(0) ||
        hasDebit === hasCredit
      ) {
        throw new BadRequestException(
          'Each journal line must contain either a debit or a credit, but not both',
        );
      }
      totalDebit = totalDebit.plus(line.debitAmount);
      totalCredit = totalCredit.plus(line.creditAmount);
      accountIds.add(line.accountId);
    }

    for (const accountId of accountIds) {
      const account = await this.accounts.require(actor, accountId);
      if (!account.isActive) {
        throw new BadRequestException(
          `Account ${account.code} is inactive and cannot be posted`,
        );
      }
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException('Journal entry is not balanced');
    }

    // Atomic conditional transition: the WHERE clause re-checks status at write
    // time instead of trusting the status read above, so a concurrent post (or
    // any other status change) between the read and this write loses the race
    // safely instead of double-posting.
    const result = await this.prisma.journalEntry.updateMany({
      where: { id, tenantId: actor.tenantId, status: JournalEntryStatus.DRAFT },
      data: { status: JournalEntryStatus.POSTED, postedAt: new Date() },
    });

    if (result.count !== 1) {
      await this.require(actor, id);
      throw new ConflictException('Only DRAFT journal entries can be posted');
    }

    const row = await this.require(actor, id);

    await this.audit.record({
      actor,
      action: 'journal-entry.posted',
      resource: 'journal-entry',
      resourceId: row.id,
      metadata: {
        entryNumber: row.entryNumber,
        totalDebit: moneyToString(totalDebit),
        totalCredit: moneyToString(totalCredit),
      },
      request,
    });

    return toJournalEntryResponse(row);
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: ENTRY_INCLUDE,
    });

    if (!row) {
      throw new NotFoundException('Journal entry not found');
    }

    return row;
  }

  private async prepareLines(
    actor: ActorContext,
    lineDtos: CreateJournalLineDto[],
  ): Promise<PreparedLine[]> {
    const seen = new Set<number>();
    const parsed: PreparedLine[] = lineDtos.map((dto) => {
      if (seen.has(dto.lineNumber)) {
        throw new BadRequestException('Duplicate line number in journal entry');
      }
      seen.add(dto.lineNumber);

      const debitAmount = parseMoney(dto.debitAmount);
      const creditAmount = parseMoney(dto.creditAmount);
      const hasDebit = debitAmount.greaterThan(0);
      const hasCredit = creditAmount.greaterThan(0);
      if (hasDebit === hasCredit) {
        throw new BadRequestException(
          'Each journal line must contain either a debit or a credit, but not both',
        );
      }

      return {
        lineNumber: dto.lineNumber,
        accountId: dto.accountId,
        debitAmount,
        creditAmount,
        description: dto.description?.trim() || null,
      };
    });

    const accountIds = [...new Set(parsed.map((line) => line.accountId))];
    for (const accountId of accountIds) {
      await this.accounts.require(actor, accountId);
    }

    return parsed;
  }

  private async nextEntryNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.journalEntry.count({ where: { tenantId } });
    return `JE-${String(count + 1).padStart(8, '0')}`;
  }
}
