import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountMappingsService } from '../account-mappings/account-mappings.service';
import { ActorContext } from '../auth/actor-context';
import { parseMoney } from '../common/decimal';
import {
  AccountMappingPurpose,
  JournalEntryStatus,
  Prisma,
} from '../../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toJournalPostingResponse } from './dto/journal-posting-response';
import {
  CreateJournalPostingDto,
  ReverseJournalPostingDto,
} from './dto/journal-posting.dto';

const POSTING_INCLUDE = {
  lines: {
    include: { account: { select: { id: true, code: true, name: true } } },
    orderBy: { lineNumber: 'asc' as const },
  },
};

interface PreparedLine {
  accountId: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  description: string | null;
}

@Injectable()
export class JournalPostingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mappings: AccountMappingsService,
  ) {}

  /**
   * Idempotent: a repeated call with the same (tenantId, sourceService,
   * sourceType, sourceId) always returns the entry created by the first
   * call — it never creates a second journal entry, whether the repeat is
   * a genuine retry after a lost response or a concurrent race (both are
   * handled: the former by the up-front lookup, the latter by inspecting a
   * unique-constraint violation from the insert itself).
   */
  async create(actor: ActorContext, dto: CreateJournalPostingDto) {
    const existing = await this.findBySource(
      actor,
      dto.sourceService,
      dto.sourceType,
      dto.sourceId,
    );
    if (existing) {
      return toJournalPostingResponse(existing, true);
    }

    const lines = await this.resolveLines(actor, dto.lines);
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
            status: JournalEntryStatus.POSTED,
            postedAt: new Date(),
            sourceService: dto.sourceService,
            sourceType: dto.sourceType,
            sourceId: dto.sourceId,
            lines: {
              create: lines.map((line, index) => ({
                tenantId: actor.tenantId,
                lineNumber: index + 1,
                accountId: line.accountId,
                debitAmount: line.debitAmount,
                creditAmount: line.creditAmount,
                description: line.description,
              })),
            },
          },
          include: POSTING_INCLUDE,
        });
        return toJournalPostingResponse(row, false);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          if (this.isSourceReferenceConflict(error)) {
            // Lost the race to a concurrent call for the same source —
            // that call's entry is authoritative; replay it, never a
            // second journal entry.
            const raced = await this.findBySource(
              actor,
              dto.sourceService,
              dto.sourceType,
              dto.sourceId,
            );
            if (raced) {
              return toJournalPostingResponse(raced, true);
            }
          }
          if (attempt < 4) {
            continue;
          }
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate journal entry number');
  }

  /**
   * Idempotent the same way as create(): a repeated reversal call for the
   * same (sourceService, reversalSourceType, sourceId) always returns the
   * first reversal entry. The original entry being reversed is looked up
   * read-only and is never updated — it stays POSTED, permanently
   * unmodified (approved Phase C1/C2 design: no VOID).
   */
  async reverse(actor: ActorContext, dto: ReverseJournalPostingDto) {
    const original = await this.findBySource(
      actor,
      dto.sourceService,
      dto.sourceType,
      dto.sourceId,
    );
    if (!original) {
      throw new NotFoundException(
        'No posted journal entry found for the given source reference',
      );
    }

    const existingReversal = await this.findBySource(
      actor,
      dto.sourceService,
      dto.reversalSourceType,
      dto.sourceId,
    );
    if (existingReversal) {
      return toJournalPostingResponse(existingReversal, true);
    }

    const entryDate = dto.entryDate ? new Date(dto.entryDate) : new Date();
    const description =
      dto.description?.trim() || `Reversal of ${original.entryNumber}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const entryNumber = await this.nextEntryNumber(actor.tenantId);
      try {
        const row = await this.prisma.journalEntry.create({
          data: {
            tenantId: actor.tenantId,
            entryNumber,
            entryDate,
            description,
            status: JournalEntryStatus.POSTED,
            postedAt: new Date(),
            sourceService: dto.sourceService,
            sourceType: dto.reversalSourceType,
            sourceId: dto.sourceId,
            reversesJournalEntryId: original.id,
            lines: {
              // Debit/credit swapped relative to the original line, same
              // account — this alone guarantees the reversal balances,
              // since the original necessarily balanced.
              create: original.lines.map((line, index) => ({
                tenantId: actor.tenantId,
                lineNumber: index + 1,
                accountId: line.accountId,
                debitAmount: line.creditAmount,
                creditAmount: line.debitAmount,
                description: line.description,
              })),
            },
          },
          include: POSTING_INCLUDE,
        });
        return toJournalPostingResponse(row, false);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          if (this.isSourceReferenceConflict(error)) {
            const raced = await this.findBySource(
              actor,
              dto.sourceService,
              dto.reversalSourceType,
              dto.sourceId,
            );
            if (raced) {
              return toJournalPostingResponse(raced, true);
            }
          }
          if (attempt < 4) {
            continue;
          }
        }
        throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate journal entry number for reversal',
    );
  }

  private async findBySource(
    actor: ActorContext,
    sourceService: string,
    sourceType: string,
    sourceId: string,
  ) {
    return this.prisma.journalEntry.findFirst({
      where: {
        tenantId: actor.tenantId,
        sourceService,
        sourceType,
        sourceId,
      },
      include: POSTING_INCLUDE,
    });
  }

  private isSourceReferenceConflict(error: unknown): boolean {
    const target = (
      error as { meta?: { target?: string[] | string } }
    ).meta?.target;
    const columns = Array.isArray(target) ? target : [target ?? ''];
    return columns.some((column) => String(column).includes('sourceId'));
  }

  private async resolveLines(
    actor: ActorContext,
    lineDtos: CreateJournalPostingDto['lines'],
  ): Promise<PreparedLine[]> {
    const prepared: PreparedLine[] = [];
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const dto of lineDtos) {
      const amount = parseMoney(dto.amount);
      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Each posting line amount must be positive');
      }

      if (dto.role === 'PAYMENT_METHOD' && !dto.paymentMethodId?.trim()) {
        throw new BadRequestException(
          'paymentMethodId is required for a PAYMENT_METHOD line',
        );
      }

      const externalRefId =
        dto.role === 'PAYMENT_METHOD' ? dto.paymentMethodId!.trim() : '';
      const account = await this.mappings.resolve(
        actor,
        dto.role as AccountMappingPurpose,
        externalRefId,
      );

      if (!account.isActive) {
        throw new BadRequestException(
          `Account ${account.code} (mapped for ${dto.role}) is inactive and cannot be posted`,
        );
      }

      const debitAmount = dto.side === 'DEBIT' ? amount : new Prisma.Decimal(0);
      const creditAmount = dto.side === 'CREDIT' ? amount : new Prisma.Decimal(0);
      totalDebit = totalDebit.plus(debitAmount);
      totalCredit = totalCredit.plus(creditAmount);

      prepared.push({
        accountId: account.id,
        debitAmount,
        creditAmount,
        description: dto.description?.trim() || null,
      });
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException('Journal posting is not balanced');
    }

    return prepared;
  }

  private async nextEntryNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.journalEntry.count({ where: { tenantId } });
    return `JE-${String(count + 1).padStart(8, '0')}`;
  }
}
