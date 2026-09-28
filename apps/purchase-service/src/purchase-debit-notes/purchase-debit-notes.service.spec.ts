import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  DebitNotePostingStatus,
  DebitNoteStatus,
  Prisma,
  PurchaseInvoiceStatus,
} from '../../generated/prisma-client';
import { AccountingJournalClient } from '../accounting/accounting-journal.client';
import { AccountingTaxCodeClient } from '../accounting/accounting-tax-code.client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { PurchaseDebitNotesService } from './purchase-debit-notes.service';

describe('PurchaseDebitNotesService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const supplierId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const invoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const debitNoteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const journalId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const reversalJournalId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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

  function debitNoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: debitNoteId,
      tenantId: actor.tenantId,
      debitNoteNumber: 'PDN-00000001',
      supplierId,
      supplierName: 'Acme Supplies',
      supplierGstin: null,
      supplierBillingAddress: null,
      purchaseInvoiceId: null,
      debitNoteDate: new Date('2026-09-01T00:00:00Z'),
      reason: 'Price correction',
      notes: null,
      subtotal: decimal('1000.0000'),
      discountTotal: decimal('0.0000'),
      taxTotal: decimal('180.0000'),
      total: decimal('1180.0000'),
      status: DebitNoteStatus.DRAFT,
      postedAt: null,
      postedBy: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
      accountingPostingStatus: DebitNotePostingStatus.NOT_POSTED,
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
    debitNote?: Record<string, unknown>;
    txQueryRawStatus?: string;
    journalPost?: jest.Mock;
    journalReverse?: jest.Mock;
  } = {}) {
    // A single mutable state object, shared between the prisma-level and
    // tx-level mocks below, so an update performed inside $transaction is
    // visible to every subsequent read/write (mirrors real Prisma/Postgres
    // read-your-own-writes behavior within one logical flow).
    const state: Record<string, unknown> = { ...debitNoteRow(), ...(options.debitNote ?? {}) };

    const txPurchaseDebitNote = {
      findFirstOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...state })),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return Promise.resolve({ ...state });
      }),
    };
    const tx = {
      $queryRaw: jest.fn((...args: unknown[]) => {
        const sql = sqlText(args);
        if (sql.includes('FROM purchase_debit_notes')) {
          return Promise.resolve([
            { id: debitNoteId, status: options.txQueryRawStatus ?? (state.status as string) },
          ]);
        }
        throw new Error(`Unexpected $queryRaw call: ${sql}`);
      }),
      purchaseDebitNote: txPurchaseDebitNote,
    };

    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: supplierId,
          name: 'Acme Supplies',
          gstin: null,
          address: null,
        }),
      },
      purchaseInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: invoiceId,
          status: PurchaseInvoiceStatus.CONFIRMED,
          supplierId,
          supplierBillingAddress: null,
        }),
      },
      purchaseDebitNote: {
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

    const service = new PurchaseDebitNotesService(
      prisma as any,
      accountingTaxCodes,
      accountingJournal,
      audit,
    );

    return { service, prisma, tx, accountingJournal, accountingTaxCodes, audit, state };
  }

  describe('create', () => {
    it('creates a standalone DRAFT debit note with no purchaseInvoiceId', async () => {
      const { service, prisma } = buildService();
      const result = await service.create(actor, {
        supplierId,
        items: [{ description: 'Price correction', quantity: '10', unitCost: '100' }],
      });
      expect(result.status).toBe(DebitNoteStatus.DRAFT);
      expect(result.purchaseInvoiceId).toBeNull();
      expect(prisma.purchaseInvoice.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an unknown supplier', async () => {
      const { service, prisma } = buildService();
      prisma.supplier.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create(actor, {
          supplierId,
          items: [{ description: 'x', quantity: '1', unitCost: '1' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('verifies an optional purchaseInvoiceId is CONFIRMED and belongs to the supplier', async () => {
      const { service, prisma } = buildService();
      prisma.purchaseInvoice.findFirst.mockResolvedValueOnce({
        id: invoiceId,
        status: PurchaseInvoiceStatus.DRAFT,
        supplierId,
        supplierBillingAddress: null,
      });
      await expect(
        service.create(actor, {
          supplierId,
          purchaseInvoiceId: invoiceId,
          items: [{ description: 'x', quantity: '1', unitCost: '1' }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a purchase invoice belonging to a different supplier', async () => {
      const { service, prisma } = buildService();
      prisma.purchaseInvoice.findFirst.mockResolvedValueOnce({
        id: invoiceId,
        status: PurchaseInvoiceStatus.CONFIRMED,
        supplierId: 'other-supplier',
        supplierBillingAddress: null,
      });
      await expect(
        service.create(actor, {
          supplierId,
          purchaseInvoiceId: invoiceId,
          items: [{ description: 'x', quantity: '1', unitCost: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero total', async () => {
      const { service } = buildService();
      await expect(
        service.create(actor, {
          supplierId,
          items: [{ description: 'x', quantity: '1', unitCost: '0' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('post', () => {
    it('transitions DRAFT -> POSTED and posts a balanced accounting journal', async () => {
      const { service, tx, accountingJournal } = buildService({
        txQueryRawStatus: DebitNoteStatus.DRAFT,
      });
      const result = await service.post(actor, debitNoteId);
      expect(result.status).toBe(DebitNoteStatus.POSTED);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.POSTED);
      expect(result.journalEntryId).toBe(journalId);

      const postCall = (accountingJournal.post as jest.Mock).mock.calls[0][1];
      const debitTotal = postCall.lines
        .filter((l: { side: string }) => l.side === 'DEBIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      const creditTotal = postCall.lines
        .filter((l: { side: string }) => l.side === 'CREDIT')
        .reduce((sum: number, l: { amount: string }) => sum + Number(l.amount), 0);
      expect(debitTotal).toBeCloseTo(creditTotal, 4);
      expect(postCall.sourceType).toBe('PURCHASE_DEBIT_NOTE');
      expect(tx.purchaseDebitNote.update).toHaveBeenCalled();
    });

    it('is idempotent when already POSTED (no duplicate journal)', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: { status: DebitNoteStatus.POSTED },
      });
      const result = await service.post(actor, debitNoteId);
      expect(result.status).toBe(DebitNoteStatus.POSTED);
      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('rejects posting a REVERSED debit note', async () => {
      const { service } = buildService({ debitNote: { status: DebitNoteStatus.REVERSED } });
      await expect(service.post(actor, debitNoteId)).rejects.toThrow(ConflictException);
    });

    it('marks accountingPostingStatus FAILED when the journal post throws, without failing post()', async () => {
      const { service } = buildService({
        txQueryRawStatus: DebitNoteStatus.DRAFT,
        journalPost: jest.fn().mockRejectedValue(new Error('accounting unavailable')),
      });
      const result = await service.post(actor, debitNoteId);
      expect(result.status).toBe(DebitNoteStatus.POSTED);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.FAILED);
    });
  });

  describe('retryAccountingPosting', () => {
    it('rejects retry on a DRAFT debit note', async () => {
      const { service } = buildService({ debitNote: { status: DebitNoteStatus.DRAFT } });
      await expect(service.retryAccountingPosting(actor, debitNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('is a no-op when accountingPostingStatus is already POSTED', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: {
          status: DebitNoteStatus.POSTED,
          accountingPostingStatus: DebitNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
      });
      const result = await service.retryAccountingPosting(actor, debitNoteId);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.POSTED);
      expect(accountingJournal.post).not.toHaveBeenCalled();
    });

    it('retries and surfaces a renewed failure to the caller', async () => {
      const { service } = buildService({
        debitNote: {
          status: DebitNoteStatus.POSTED,
          accountingPostingStatus: DebitNotePostingStatus.FAILED,
        },
        journalPost: jest.fn().mockRejectedValue(new Error('still down')),
      });
      await expect(service.retryAccountingPosting(actor, debitNoteId)).rejects.toThrow(
        'still down',
      );
    });
  });

  describe('reverse', () => {
    it('transitions POSTED -> REVERSED and posts a reversal journal', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: {
          status: DebitNoteStatus.POSTED,
          accountingPostingStatus: DebitNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
        txQueryRawStatus: DebitNoteStatus.POSTED,
      });
      const result = await service.reverse(actor, debitNoteId, { reason: 'undo' });
      expect(result.status).toBe(DebitNoteStatus.REVERSED);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe(reversalJournalId);
      expect(accountingJournal.reverse).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          sourceType: 'PURCHASE_DEBIT_NOTE',
          reversalSourceType: 'PURCHASE_DEBIT_NOTE_REVERSAL',
        }),
      );
    });

    it('rejects reversing a DRAFT debit note', async () => {
      const { service } = buildService({ debitNote: { status: DebitNoteStatus.DRAFT } });
      await expect(service.reverse(actor, debitNoteId, {})).rejects.toThrow(ConflictException);
    });

    it('is idempotent when already REVERSED (no duplicate reversal journal)', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: { status: DebitNoteStatus.REVERSED },
      });
      const result = await service.reverse(actor, debitNoteId, {});
      expect(result.status).toBe(DebitNoteStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });

    it('never reverses when accountingPostingStatus was never POSTED', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: {
          status: DebitNoteStatus.POSTED,
          accountingPostingStatus: DebitNotePostingStatus.FAILED,
        },
        txQueryRawStatus: DebitNoteStatus.POSTED,
      });
      const result = await service.reverse(actor, debitNoteId, {});
      expect(result.status).toBe(DebitNoteStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });
  });

  describe('retryAccountingReversal', () => {
    it('rejects retry on a non-REVERSED debit note', async () => {
      const { service } = buildService({ debitNote: { status: DebitNoteStatus.POSTED } });
      await expect(service.retryAccountingReversal(actor, debitNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('is a no-op when accountingPostingStatus is already REVERSED', async () => {
      const { service, accountingJournal } = buildService({
        debitNote: {
          status: DebitNoteStatus.REVERSED,
          accountingPostingStatus: DebitNotePostingStatus.REVERSED,
        },
      });
      const result = await service.retryAccountingReversal(actor, debitNoteId);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.REVERSED);
      expect(accountingJournal.reverse).not.toHaveBeenCalled();
    });

    it('rejects when there is no posted journal to reverse', async () => {
      const { service } = buildService({
        debitNote: {
          status: DebitNoteStatus.REVERSED,
          accountingPostingStatus: DebitNotePostingStatus.FAILED,
        },
      });
      await expect(service.retryAccountingReversal(actor, debitNoteId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('retries a failed reversal successfully', async () => {
      const { service } = buildService({
        debitNote: {
          status: DebitNoteStatus.REVERSED,
          accountingPostingStatus: DebitNotePostingStatus.POSTED,
          journalEntryId: journalId,
        },
      });
      const result = await service.retryAccountingReversal(actor, debitNoteId);
      expect(result.accountingPostingStatus).toBe(DebitNotePostingStatus.REVERSED);
      expect(result.reversalJournalEntryId).toBe(reversalJournalId);
    });
  });
});
