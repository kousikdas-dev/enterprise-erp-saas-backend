import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SalesCreditNotePostingStatus,
  SalesCreditNoteStatus,
  SalesInvoiceStatus,
} from '../../generated/prisma-client';
import { AccountingJournalClient } from '../accounting/accounting-journal.client';
import { AccountingTaxCodeClient } from '../accounting/accounting-tax-code.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { SalesCreditNotesService } from './sales-credit-notes.service';

describe('SalesCreditNotesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const invoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const creditNoteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const journalId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const reversalJournalId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const otherTenantId = '99999999-9999-4999-8999-999999999999';

  function decimal(v: string) {
    return new Prisma.Decimal(v);
  }

  function sqlText(args: unknown[]): string {
    const first = args[0] as { sql?: string } | string[];
    if (first && typeof first === 'object' && 'sql' in first && (first as { sql?: string }).sql) {
      return (first as { sql: string }).sql;
    }
    if (Array.isArray(first)) return first.join(' ');
    return String(first);
  }

  function creditNoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: creditNoteId,
      tenantId: actor.tenantId,
      creditNoteNumber: 'SCN-00000001',
      customerId,
      customerName: 'Acme Retail',
      customerGstin: null,
      customerBillingAddress: null,
      salesInvoiceId: null,
      creditNoteDate: new Date('2026-09-01T00:00:00Z'),
      reason: 'Price correction',
      notes: null,
      subtotal: decimal('1000.0000'),
      discountTotal: decimal('0.0000'),
      taxTotal: decimal('180.0000'),
      total: decimal('1180.0000'),
      status: SalesCreditNoteStatus.DRAFT,
      postedAt: null,
      postedBy: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
      accountingPostingStatus: SalesCreditNotePostingStatus.NOT_POSTED,
      journalEntryId: null,
      reversalJournalEntryId: null,
      createdBy: actor.userId,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      items: [],
      ...overrides,
    };
  }

  function buildService(options: {
    creditNote?: Record<string, unknown>;
    txQueryRawStatus?: string;
    journalPost?: jest.Mock;
    journalReverse?: jest.Mock;
    customer?: Record<string, unknown> | null;
    invoice?: Record<string, unknown> | null;
  } = {}) {
    const state: Record<string, unknown> = { ...creditNoteRow(), ...(options.creditNote ?? {}) };

    const txSalesCreditNote = {
      findFirstOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...state })),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return Promise.resolve({ ...state });
      }),
    };
    const tx = {
      $queryRaw: jest.fn((...args: unknown[]) => {
        const sql = sqlText(args);
        if (sql.includes('FROM sales_credit_notes')) {
          return Promise.resolve([
            { id: creditNoteId, status: options.txQueryRawStatus ?? (state.status as string) },
          ]);
        }
        throw new Error(`Unexpected $queryRaw call: ${sql}`);
      }),
      salesCreditNote: txSalesCreditNote,
    };

    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(
          options.customer === null
            ? null
            : {
                id: customerId,
                name: 'Acme Retail',
                gstin: null,
                ...(options.customer ?? {}),
              },
        ),
      },
      salesInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          options.invoice === null
            ? null
            : {
                id: invoiceId,
                status: SalesInvoiceStatus.SENT,
                customerId,
                billingAddress: null,
                ...(options.invoice ?? {}),
              },
        ),
      },
      salesCreditNote: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(() => Promise.resolve({ ...state })),
        findFirst: jest.fn().mockImplementation(() => Promise.resolve({ ...state })),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state, data);
          return Promise.resolve({ ...state });
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    };

    const accountingTaxCodes = {
      getById: jest.fn(),
    } as unknown as AccountingTaxCodeClient;

    const accountingJournal = {
      post:
        options.journalPost ??
        jest.fn().mockResolvedValue({ id: journalId, idempotentReplay: false }),
      reverse:
        options.journalReverse ??
        jest.fn().mockResolvedValue({ id: reversalJournalId, idempotentReplay: false }),
    } as unknown as AccountingJournalClient;

    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as IdentityAuditClient;

    const service = new SalesCreditNotesService(
      prisma as any,
      accountingTaxCodes,
      accountingJournal,
      audit,
    );

    return { service, prisma, tx, accountingJournal, accountingTaxCodes, audit, state };
  }

  describe('create', () => {
    it('creates a standalone DRAFT credit note with no salesInvoiceId', async () => {
      const { service, prisma } = buildService();
      const result = await service.create(actor, {
        customerId,
        items: [{ description: 'Price correction', quantity: '10', unitPrice: '100' }],
      });
      expect(result.status).toBe(SalesCreditNoteStatus.DRAFT);
      expect(result.salesInvoiceId).toBeNull();
      expect(prisma.salesInvoice.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an unknown customer', async () => {
      const { service } = buildService({ customer: null });
      await expect(
        service.create(actor, {
          customerId,
          items: [{ description: 'x', quantity: '1', unitPrice: '1' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown tenant customer (cross-tenant isolation)', async () => {
      const { service, prisma } = buildService({ customer: null });
      await expect(
        service.create(
          { userId: actor.userId, tenantId: otherTenantId },
          {
            customerId,
            items: [{ description: 'x', quantity: '1', unitPrice: '1' }],
          },
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: customerId, tenantId: otherTenantId } }),
      );
    });

    it('creates with a valid SENT invoice reference', async () => {
      const { service, prisma } = buildService();
      const result = await service.create(actor, {
        customerId,
        salesInvoiceId: invoiceId,
        items: [{ description: 'x', quantity: '1', unitPrice: '100' }],
      });
      expect(prisma.salesInvoice.findFirst).toHaveBeenCalled();
      expect(result.status).toBe(SalesCreditNoteStatus.DRAFT);
    });

    it('rejects an unknown invoice reference', async () => {
      const { service } = buildService({ invoice: null });
      await expect(
        service.create(actor, {
          customerId,
          salesInvoiceId: invoiceId,
          items: [{ description: 'x', quantity: '1', unitPrice: '1' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('verifies an optional salesInvoiceId is SENT', async () => {
      const { service } = buildService({ invoice: { status: SalesInvoiceStatus.DRAFT } });
      await expect(
        service.create(actor, {
          customerId,
          salesInvoiceId: invoiceId,
          items: [{ description: 'x', quantity: '1', unitPrice: '1' }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a sales invoice belonging to a different customer', async () => {
      const { service } = buildService({ invoice: { customerId: 'other-customer' } });
      await expect(
        service.create(actor, {
          customerId,
          salesInvoiceId: invoiceId,
          items: [{ description: 'x', quantity: '1', unitPrice: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero total', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          customerId,
          items: [{ description: 'x', quantity: '1', unitPrice: '0' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('post', () => {
    it('transitions DRAFT -> POSTED and posts a balanced accounting journal', async () => {
      const { service, tx, accountingJournal } = buildService({
        txQueryRawStatus: SalesCreditNoteStatus.DRAFT,
      });
      const result = await service.post(actor, creditNoteId);
      expect(result.status).toBe(SalesCreditNoteStatus.POSTED);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.POSTED);
      expect(result.journalEntryId).toBe(journalId);

      const postCall = (accountingJournal.post as jest.Mock).mock.calls[0][1];
      const debitTotal = postCall.lines
        .filter((l: { side: string }) => l.side === 'DEBIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      const creditTotal = postCall.lines
        .filter((l: { side: string }) => l.side === 'CREDIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      expect(debitTotal).toBeCloseTo(creditTotal, 4);
      expect(postCall.sourceType).toBe('SALES_CREDIT_NOTE');
      // Dr SALES_REVENUE subtotal, Dr OUTPUT_TAX taxTotal; Cr ACCOUNTS_RECEIVABLE total.
      expect(postCall.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'SALES_REVENUE', side: 'DEBIT', amount: '1000.0000' }),
          expect.objectContaining({ role: 'OUTPUT_TAX', side: 'DEBIT', amount: '180.0000' }),
          expect.objectContaining({
            role: 'ACCOUNTS_RECEIVABLE',
            side: 'CREDIT',
            amount: '1180.0000',
          }),
        ]),
      );
      expect(tx.salesCreditNote.update).toHaveBeenCalled();
    });

    it('includes a SALES_DISCOUNT credit line when discountTotal > 0', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: {
          subtotal: decimal('1000.0000'),
          discountTotal: decimal('100.0000'),
          taxTotal: decimal('0.0000'),
          total: decimal('900.0000'),
        },
        txQueryRawStatus: SalesCreditNoteStatus.DRAFT,
      });
      await service.post(actor, creditNoteId);
      const postCall = (accountingJournal.post as jest.Mock).mock.calls[0][1];
      expect(postCall.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'SALES_DISCOUNT', side: 'CREDIT', amount: '100.0000' }),
        ]),
      );
    });

    it('is idempotent when already POSTED (no duplicate journal)', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: { status: SalesCreditNoteStatus.POSTED },
      });
      const result = await service.post(actor, creditNoteId);
      expect(result.status).toBe(SalesCreditNoteStatus.POSTED);
      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('rejects posting a REVERSED credit note', async () => {
      const { service } = buildService({ creditNote: { status: SalesCreditNoteStatus.REVERSED } });
      await expect(service.post(actor, creditNoteId)).rejects.toThrow(ConflictException);
    });

    it('marks accountingPostingStatus FAILED when the journal post throws, without failing post()', async () => {
      const { service } = buildService({
        txQueryRawStatus: SalesCreditNoteStatus.DRAFT,
        journalPost: jest.fn().mockRejectedValue(new Error('accounting unavailable')),
      });
      const result = await service.post(actor, creditNoteId);
      expect(result.status).toBe(SalesCreditNoteStatus.POSTED);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.FAILED);
    });
  });

  describe('retryAccountingPosting', () => {
    it('rejects retry on a DRAFT credit note', async () => {
      const { service } = buildService({ creditNote: { status: SalesCreditNoteStatus.DRAFT } });
      await expect(service.retryAccountingPosting(actor, creditNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('is a no-op when accountingPostingStatus is already POSTED', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.POSTED,
          accountingPostingStatus: SalesCreditNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
      });
      const result = await service.retryAccountingPosting(actor, creditNoteId);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.POSTED);
      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('retries and surfaces a renewed failure to the caller', async () => {
      const { service } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.POSTED,
          accountingPostingStatus: SalesCreditNotePostingStatus.FAILED,
        },
        journalPost: jest.fn().mockRejectedValue(new Error('still down')),
      });
      await expect(service.retryAccountingPosting(actor, creditNoteId)).rejects.toThrow(
        'still down',
      );
    });
  });

  describe('reverse', () => {
    it('transitions POSTED -> REVERSED and posts an exact-mirror reversal journal', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.POSTED,
          accountingPostingStatus: SalesCreditNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
        txQueryRawStatus: SalesCreditNoteStatus.POSTED,
      });
      const result = await service.reverse(actor, creditNoteId, { reason: 'undo' });
      expect(result.status).toBe(SalesCreditNoteStatus.REVERSED);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe(reversalJournalId);
      expect(accountingJournal.reverse).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceType: 'SALES_CREDIT_NOTE',
          reversalSourceType: 'SALES_CREDIT_NOTE_REVERSAL',
        }),
      );
    });

    it('rejects reversing a DRAFT credit note', async () => {
      const { service } = buildService({ creditNote: { status: SalesCreditNoteStatus.DRAFT } });
      await expect(service.reverse(actor, creditNoteId, {})).rejects.toThrow(ConflictException);
    });

    it('is idempotent when already REVERSED (no duplicate reversal journal)', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: { status: SalesCreditNoteStatus.REVERSED },
      });
      const result = await service.reverse(actor, creditNoteId, {});
      expect(result.status).toBe(SalesCreditNoteStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });

    it('never reverses when accountingPostingStatus was never POSTED', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.POSTED,
          accountingPostingStatus: SalesCreditNotePostingStatus.FAILED,
        },
        txQueryRawStatus: SalesCreditNoteStatus.POSTED,
      });
      const result = await service.reverse(actor, creditNoteId, {});
      expect(result.status).toBe(SalesCreditNoteStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });

    it('marks accountingPostingStatus FAILED-safe (left at POSTED) when the reversal journal call throws', async () => {
      const { service } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.POSTED,
          accountingPostingStatus: SalesCreditNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
        txQueryRawStatus: SalesCreditNoteStatus.POSTED,
        journalReverse: jest.fn().mockRejectedValue(new Error('accounting unavailable')),
      });
      const result = await service.reverse(actor, creditNoteId, {});
      expect(result.status).toBe(SalesCreditNoteStatus.REVERSED);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.POSTED);
      expect(result.reversalJournalEntryId).toBeNull();
    });
  });

  describe('retryAccountingReversal', () => {
    it('rejects retry on a non-REVERSED credit note', async () => {
      const { service } = buildService({ creditNote: { status: SalesCreditNoteStatus.POSTED } });
      await expect(service.retryAccountingReversal(actor, creditNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('is a no-op when accountingPostingStatus is already REVERSED', async () => {
      const { service, accountingJournal } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.REVERSED,
          accountingPostingStatus: SalesCreditNotePostingStatus.REVERSED,
        },
      });
      const result = await service.retryAccountingReversal(actor, creditNoteId);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });

    it('rejects when there is no posted journal to reverse', async () => {
      const { service } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.REVERSED,
          accountingPostingStatus: SalesCreditNotePostingStatus.FAILED,
        },
      });
      await expect(service.retryAccountingReversal(actor, creditNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('retries a failed reversal successfully', async () => {
      const { service } = buildService({
        creditNote: {
          status: SalesCreditNoteStatus.REVERSED,
          accountingPostingStatus: SalesCreditNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
      });
      const result = await service.retryAccountingReversal(actor, creditNoteId);
      expect(result.accountingPostingStatus).toBe(SalesCreditNotePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe(reversalJournalId);
    });
  });

  describe('tenant isolation', () => {
    it('getById 404s for a credit note belonging to a different tenant', async () => {
      const { service, prisma } = buildService();
      (prisma.salesCreditNote.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.getById({ userId: actor.userId, tenantId: otherTenantId }, creditNoteId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
