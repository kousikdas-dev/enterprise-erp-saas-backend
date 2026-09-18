import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '../../generated/prisma-client';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
  };
  const supplierId = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
  const productId = '33333333-3333-4333-8333-333333333333';
  const unitOfMeasureId = '99999999-9999-4999-8999-999999999999';
  const altUnitOfMeasureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const taxCodeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function decimal(value: string) {
    return new Prisma.Decimal(value);
  }

  function mockSupplier(overrides: Record<string, unknown> = {}) {
    return {
      id: supplierId,
      tenantId,
      code: 'SUP1',
      name: 'Acme Supplies',
      gstin: '22AAAAA0000A1Z5',
      paymentTermId: '66666666-6666-4666-8666-666666666666',
      ...overrides,
    };
  }

  const billingAddressId = '44444444-4444-4444-8444-444444444444';
  const dispatchAddressId = '55555555-5555-4555-8555-555555555555';
  const altBillingAddressId = '66666666-6666-4666-8aaa-666666666666';

  function mockSupplierAddresses(overrides: Array<Record<string, unknown>> = []) {
    if (overrides.length > 0) return overrides;
    return [
      {
        id: billingAddressId,
        type: 'BILLING',
        addressLine1: '1 Bill St',
        addressLine2: null,
        city: 'Springfield',
        state: 'IL',
        postalCode: '10001',
        country: 'US',
        isDefault: true,
      },
      {
        id: dispatchAddressId,
        type: 'DISPATCH',
        addressLine1: '2 Dispatch Rd',
        addressLine2: null,
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
        isDefault: true,
      },
      {
        id: altBillingAddressId,
        type: 'BILLING',
        addressLine1: '9 Alt Ave',
        addressLine2: null,
        city: 'Metropolis',
        state: 'NY',
        postalCode: '20002',
        country: 'US',
        isDefault: false,
      },
    ];
  }

  function defaultUomOptions(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      base: { unitOfMeasureId, code: 'EA', name: 'Each' },
      alternatives: [],
      ...overrides,
    };
  }

  function defaultInventoryProducts(
    overrides: Partial<{ getUomOptions: jest.Mock }> = {},
  ) {
    return {
      getUomOptions: jest.fn().mockResolvedValue(defaultUomOptions()),
      ...overrides,
    };
  }

  function defaultAccountingTaxCodes(
    overrides: Partial<{ getById: jest.Mock }> = {},
  ) {
    return {
      getById: jest.fn(),
      ...overrides,
    };
  }

  function taxCodeResponse(overrides: Record<string, unknown> = {}) {
    return {
      id: taxCodeId,
      code: 'GST18',
      name: 'GST 18%',
      description: null,
      isActive: true,
      components: [
        { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
        { id: 'comp-2', sequence: 2, type: 'SGST', name: null, rate: '9.0000' },
      ],
      ...overrides,
    };
  }

  function createService(
    deps: {
      prisma?: unknown;
      audit?: unknown;
      inventoryProducts?: unknown;
      accountingTaxCodes?: unknown;
    } = {},
  ) {
    return new PurchaseOrdersService(
      (deps.prisma ?? {}) as never,
      (deps.audit ?? { record: jest.fn().mockResolvedValue(undefined) }) as never,
      (deps.inventoryProducts ?? defaultInventoryProducts()) as never,
      (deps.accountingTaxCodes ?? defaultAccountingTaxCodes()) as never,
    );
  }

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const { purchaseOrder, ...rest } = overrides as {
      purchaseOrder?: Record<string, unknown>;
    };
    return {
      supplier: { findFirst: jest.fn().mockResolvedValue(mockSupplier()) },
      supplierAddress: {
        findMany: jest.fn().mockResolvedValue(mockSupplierAddresses()),
      },
      // count() defaults to 0 (first PO number allocated) unless a test
      // overrides it — merged in so every `purchaseOrder: { create: ... }`
      // override doesn't need to repeat it.
      purchaseOrder: { count: jest.fn().mockResolvedValue(0), ...purchaseOrder },
      ...rest,
    };
  }

  function baseItemInput(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: '10',
      unitOfMeasureId,
      unitCost: '5.0000',
      ...overrides,
    };
  }

  function orderItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'poi1',
      tenantId,
      purchaseOrderId: 'po1',
      productId,
      productSku: 'SKU-1',
      productName: 'Widget',
      quantity: decimal('10'),
      unitOfMeasureId,
      uomCode: 'EA',
      uomName: 'Each',
      conversionFactor: decimal('1'),
      unitCost: decimal('5'),
      discountPercent: decimal('0'),
      discountAmount: decimal('0'),
      taxCodeId: null,
      taxCode: null,
      taxCodeName: null,
      taxAmount: decimal('0'),
      lineSubtotal: decimal('50'),
      lineTotal: decimal('50'),
      receivedQuantity: decimal('0'),
      // Purchase Invoice V1 accumulator (Section 22) — added to the response
      // alongside receivedQuantity; defaulted here like every other field.
      invoicedQuantity: decimal('0'),
      createdAt: new Date(),
      updatedAt: new Date(),
      taxComponents: [],
      ...overrides,
    };
  }

  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'po1',
      tenantId,
      poNumber: 'PO-00000001',
      supplierId,
      status: PurchaseOrderStatus.DRAFT,
      supplierName: 'Acme Supplies',
      supplierGstin: '22AAAAA0000A1Z5',
      supplierBillingAddress: '1 Bill St, Springfield, IL, 10001, US',
      supplierDispatchAddress: '2 Dispatch Rd, Chicago, IL, 60601, US',
      supplierBillingAddressId: billingAddressId,
      supplierDispatchAddressId: dispatchAddressId,
      paymentTermId: '66666666-6666-4666-8666-666666666666',
      buyerId: null,
      supplierReference: null,
      expectedDeliveryDate: null,
      notes: null,
      orderDate: new Date(),
      subtotal: decimal('50'),
      discountTotal: decimal('0'),
      taxTotal: decimal('0'),
      total: decimal('50'),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [orderItemRow()],
      ...overrides,
    };
  }

  it('creates purchase order with supplier snapshot and resolved UOM', async () => {
    const created = orderRow();
    const prisma = basePrisma({
      purchaseOrder: { create: jest.fn().mockResolvedValue(created) },
    });
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });

    const result = await service.create(actor, {
      supplierId,
      items: [baseItemInput()],
    });

    expect(result.supplierName).toBe('Acme Supplies');
    expect(result.supplierGstin).toBe('22AAAAA0000A1Z5');
    expect(result.supplierBillingAddress).toBe(
      '1 Bill St, Springfield, IL, 10001, US',
    );
    expect(result.supplierDispatchAddress).toBe(
      '2 Dispatch Rd, Chicago, IL, 60601, US',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase-order.created' }),
    );

    const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
      .data;
    expect(data.supplierId).toBe(supplierId);
    expect(data.paymentTermId).toBe('66666666-6666-4666-8666-666666666666');
    expect(data.items.create[0].unitOfMeasureId).toBe(unitOfMeasureId);
    expect(data.items.create[0].uomCode).toBe('EA');
  });

  it('returns null snapshot address fields when the supplier has no active addresses', async () => {
    const prisma = basePrisma({
      supplierAddress: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
    });
    const service = createService({ prisma });

    await service.create(actor, { supplierId, items: [baseItemInput()] });

    const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
      .data;
    expect(data.supplierBillingAddress).toBeNull();
    expect(data.supplierDispatchAddress).toBeNull();
  });

  it('rejects create when the supplier does not exist in the tenant', async () => {
    const prisma = basePrisma({
      supplier: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = createService({ prisma });
    await expect(
      service.create(actor, { supplierId, items: [baseItemInput()] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects update when not DRAFT', async () => {
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: PurchaseOrderStatus.CONFIRMED })),
      },
    });
    const service = createService({ prisma });
    await expect(
      service.update(actor, 'po1', { notes: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recomputes discountTotal/taxTotal from the replaced items on update', async () => {
    const updated = orderRow({ items: [] });
    const updateMock = jest.fn().mockResolvedValue(updated);
    const createItemMock = jest.fn().mockResolvedValue(undefined);
    const tx = {
      purchaseOrder: { update: updateMock },
      purchaseOrderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: createItemMock,
      },
    };
    const prisma = basePrisma({
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(orderRow()) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    });
    const accountingTaxCodes = defaultAccountingTaxCodes({
      getById: jest.fn().mockResolvedValue(taxCodeResponse()),
    });
    const service = createService({ prisma, accountingTaxCodes });

    await service.update(actor, 'po1', {
      items: [
        baseItemInput({
          quantity: '10',
          unitCost: '5.0000',
          discountPercent: '10',
          taxCodeId,
        }),
      ],
    });

    expect(createItemMock).toHaveBeenCalledTimes(1);
    const data = updateMock.mock.calls[0][0].data;
    // gross = 50; discount 10% = 5; lineSubtotal = 45; tax 18% of 45 = 8.1
    expect(data.discountTotal.toFixed(4)).toBe('5.0000');
    expect(data.taxTotal.toFixed(4)).toBe('8.1000');
    expect(data.total.toFixed(4)).toBe('53.1000');
  });

  it('re-derives the supplier snapshot only when supplierId changes on update', async () => {
    const newSupplierId = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
    const updateMock = jest.fn().mockResolvedValue(orderRow());
    const tx = { purchaseOrder: { update: updateMock } };
    const prisma = basePrisma({
      supplier: {
        findFirst: jest
          .fn()
          .mockResolvedValue(mockSupplier({ id: newSupplierId, name: 'New Co' })),
      },
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: updateMock,
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    });
    const service = createService({ prisma });

    await service.update(actor, 'po1', { supplierId: newSupplierId });

    const data = updateMock.mock.calls[0][0].data;
    expect(data.supplierId).toBe(newSupplierId);
    expect(data.supplierName).toBe('New Co');
  });

  it('does not touch supplier snapshot fields when only notes change', async () => {
    const updateMock = jest.fn().mockResolvedValue(orderRow());
    const tx = { purchaseOrder: { update: updateMock } };
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: updateMock,
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    });
    const service = createService({ prisma });

    await service.update(actor, 'po1', { notes: 'updated' });

    const data = updateMock.mock.calls[0][0].data;
    expect(data.supplierId).toBeUndefined();
    expect(data.supplierName).toBeUndefined();
    expect(data.notes).toBe('updated');
  });

  it('confirms DRAFT purchase order', async () => {
    const confirmed = orderRow({ status: PurchaseOrderStatus.CONFIRMED });
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: jest.fn().mockResolvedValue(confirmed),
      },
    });
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    const result = await service.confirm(actor, 'po1');
    expect(result.status).toBe(PurchaseOrderStatus.CONFIRMED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase-order.confirmed' }),
    );
  });

  it('rejects confirm with no items', async () => {
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow({ items: [] })),
      },
    });
    const service = createService({ prisma });
    await expect(service.confirm(actor, 'po1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cancels a DRAFT purchase order', async () => {
    const cancelled = orderRow({ status: PurchaseOrderStatus.CANCELLED });
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(orderRow()),
        update: jest.fn().mockResolvedValue(cancelled),
      },
    });
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = createService({ prisma, audit });
    const result = await service.cancel(actor, 'po1');
    expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase-order.cancelled' }),
    );
  });

  it('cancels a CONFIRMED purchase order when no items have receipts', async () => {
    const cancelled = orderRow({ status: PurchaseOrderStatus.CANCELLED });
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: PurchaseOrderStatus.CONFIRMED })),
        update: jest.fn().mockResolvedValue(cancelled),
      },
    });
    const service = createService({ prisma });
    const result = await service.cancel(actor, 'po1');
    expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
  });

  it('rejects cancel of a CONFIRMED purchase order that has receipts', async () => {
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(
          orderRow({
            status: PurchaseOrderStatus.CONFIRMED,
            items: [orderItemRow({ receivedQuantity: decimal('3') })],
          }),
        ),
      },
    });
    const service = createService({ prisma });
    await expect(service.cancel(actor, 'po1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects cancel of a RECEIVED purchase order', async () => {
    const prisma = basePrisma({
      purchaseOrder: {
        findFirst: jest
          .fn()
          .mockResolvedValue(orderRow({ status: PurchaseOrderStatus.RECEIVED })),
      },
    });
    const service = createService({ prisma });
    await expect(service.cancel(actor, 'po1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('scopes getById to tenant', async () => {
    const prisma = basePrisma({
      purchaseOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = createService({ prisma });
    await expect(service.getById(actor, 'po1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'po1', tenantId },
      }),
    );
  });

  describe('PO V1 document fields', () => {
    it('generates a tenant-scoped, human-readable PO number', async () => {
      const prisma = basePrisma({
        purchaseOrder: {
          count: jest.fn().mockResolvedValue(41),
          create: jest.fn().mockResolvedValue(orderRow({ poNumber: 'PO-00000042' })),
        },
      });
      const service = createService({ prisma });

      await service.create(actor, { supplierId, items: [baseItemInput()] });

      expect(prisma.purchaseOrder.count).toHaveBeenCalledWith({
        where: { tenantId },
      });
      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.poNumber).toBe('PO-00000042');
    });

    it('retries PO number allocation on a unique-constraint collision and eventually succeeds', async () => {
      const conflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
      const create = jest
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce(orderRow({ poNumber: 'PO-00000002' }));
      const count = jest
        .fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      const prisma = basePrisma({ purchaseOrder: { count, create } });
      const service = createService({ prisma });

      const result = await service.create(actor, {
        supplierId,
        items: [baseItemInput()],
      });

      expect(create).toHaveBeenCalledTimes(2);
      expect(result.poNumber).toBe('PO-00000002');
    });

    it('gives up after 5 unique-constraint collisions', async () => {
      // Mirrors ProformaInvoicesService/SalesInvoicesService's identical
      // retry loop exactly: the 5th (final) collision is re-thrown as-is
      // rather than reaching the loop's trailing ConflictException, since
      // `attempt < 4` is false on the last iteration in both services.
      const conflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
      const create = jest.fn().mockRejectedValue(conflict);
      const prisma = basePrisma({ purchaseOrder: { create } });
      const service = createService({ prisma });

      await expect(
        service.create(actor, { supplierId, items: [baseItemInput()] }),
      ).rejects.toBe(conflict);
      expect(create).toHaveBeenCalledTimes(5);
    });

    it('persists supplierReference, expectedDeliveryDate and buyerId', async () => {
      const buyerId = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await service.create(actor, {
        supplierId,
        supplierReference: ' Quote #123 ',
        expectedDeliveryDate: '2026-10-01',
        buyerId,
        items: [baseItemInput()],
      });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.supplierReference).toBe('Quote #123');
      expect(data.expectedDeliveryDate).toEqual(new Date('2026-10-01'));
      expect(data.buyerId).toBe(buyerId);
    });

    it('defaults paymentTermId from the supplier when not explicitly provided', async () => {
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await service.create(actor, { supplierId, items: [baseItemInput()] });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.paymentTermId).toBe('66666666-6666-4666-8666-666666666666');
    });

    it('overrides the supplier default when paymentTermId is explicitly provided', async () => {
      const overrideTermId = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await service.create(actor, {
        supplierId,
        paymentTermId: overrideTermId,
        items: [baseItemInput()],
      });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.paymentTermId).toBe(overrideTermId);
    });

    it('on update, an explicit paymentTermId override takes precedence even without a supplier change', async () => {
      const overrideTermId = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', { paymentTermId: overrideTermId });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.paymentTermId).toBe(overrideTermId);
      expect(data.supplierId).toBeUndefined();
    });

    it('on update, an untouched header field (e.g. supplierReference) is left alone', async () => {
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', { notes: 'updated' });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.supplierReference).toBeUndefined();
      expect(data.buyerId).toBeUndefined();
      expect(data.expectedDeliveryDate).toBeUndefined();
    });

    it('on update, an explicit null clears an optional header field', async () => {
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', {
        buyerId: null,
        expectedDeliveryDate: null,
      });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.buyerId).toBeNull();
      expect(data.expectedDeliveryDate).toBeNull();
    });
  });

  describe('billing/dispatch address selection', () => {
    it('persists an explicitly selected billing/dispatch address id and its formatted text snapshot', async () => {
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await service.create(actor, {
        supplierId,
        billingAddressId: altBillingAddressId,
        dispatchAddressId,
        items: [baseItemInput()],
      });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.supplierBillingAddressId).toBe(altBillingAddressId);
      expect(data.supplierBillingAddress).toBe(
        '9 Alt Ave, Metropolis, NY, 20002, US',
      );
      expect(data.supplierDispatchAddressId).toBe(dispatchAddressId);
      expect(data.supplierDispatchAddress).toBe(
        '2 Dispatch Rd, Chicago, IL, 60601, US',
      );
    });

    it('falls back to the supplier default address when no id is supplied', async () => {
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await service.create(actor, { supplierId, items: [baseItemInput()] });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.supplierBillingAddressId).toBe(billingAddressId);
      expect(data.supplierDispatchAddressId).toBe(dispatchAddressId);
    });

    it('rejects an address id that does not belong to the selected supplier', async () => {
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await expect(
        service.create(actor, {
          supplierId,
          billingAddressId: '77777777-7777-4777-8777-777777777777',
          items: [baseItemInput()],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an address id whose type does not match the requested slot', async () => {
      const prisma = basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
      const service = createService({ prisma });

      await expect(
        service.create(actor, {
          supplierId,
          // billingAddressId is a real address for this supplier, but it's
          // a DISPATCH address, not BILLING.
          billingAddressId: dispatchAddressId,
          items: [baseItemInput()],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('on update, an explicit billingAddressId is validated against the existing supplier and leaves dispatch untouched', async () => {
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', {
        billingAddressId: altBillingAddressId,
      });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.supplierBillingAddressId).toBe(altBillingAddressId);
      expect(data.supplierBillingAddress).toBe(
        '9 Alt Ave, Metropolis, NY, 20002, US',
      );
      expect(data.supplierDispatchAddressId).toBeUndefined();
      expect(data.supplierDispatchAddress).toBeUndefined();
      expect(prisma.supplierAddress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ supplierId }),
        }),
      );
    });

    it('on update, both addresses are re-derived from the new supplier when supplierId changes and no explicit id is given', async () => {
      const newSupplierId = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        supplier: {
          findFirst: jest
            .fn()
            .mockResolvedValue(mockSupplier({ id: newSupplierId, name: 'New Co' })),
        },
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', { supplierId: newSupplierId });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.supplierBillingAddressId).toBe(billingAddressId);
      expect(data.supplierDispatchAddressId).toBe(dispatchAddressId);
    });

    it('on update, an untouched address field is left alone when only notes change', async () => {
      const updateMock = jest.fn().mockResolvedValue(orderRow());
      const tx = { purchaseOrder: { update: updateMock } };
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
          update: updateMock,
        },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      });
      const service = createService({ prisma });

      await service.update(actor, 'po1', { notes: 'updated' });

      const data = updateMock.mock.calls[0][0].data;
      expect(data.supplierBillingAddressId).toBeUndefined();
      expect(data.supplierDispatchAddressId).toBeUndefined();
      expect(data.supplierBillingAddress).toBeUndefined();
      expect(data.supplierDispatchAddress).toBeUndefined();
    });

    it('rejects an update address id that does not belong to the order supplier', async () => {
      const prisma = basePrisma({
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(orderRow()),
        },
      });
      const service = createService({ prisma });

      await expect(
        service.update(actor, 'po1', {
          dispatchAddressId: '77777777-7777-4777-8777-777777777777',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('UOM/discount/tax calculation', () => {
    function prismaForCreate() {
      return basePrisma({
        purchaseOrder: { create: jest.fn().mockResolvedValue(orderRow()) },
      });
    }

    it('computes gross, discount, lineSubtotal, tax and lineTotal for a discounted, single-component-tax line', async () => {
      const prisma = prismaForCreate();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.create(actor, {
        supplierId,
        items: [
          baseItemInput({
            quantity: '10',
            unitCost: '5.0000',
            discountPercent: '10',
            taxCodeId,
          }),
        ],
      });

      const item = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.discountAmount.toFixed(4)).toBe('5.0000');
      expect(item.lineSubtotal.toFixed(4)).toBe('45.0000');
      expect(item.taxAmount.toFixed(4)).toBe('4.0500');
      expect(item.lineTotal.toFixed(4)).toBe('49.0500');
      expect(accountingTaxCodes.getById).toHaveBeenCalledWith(actor, taxCodeId);
    });

    it('sums multi-component tax (CGST + SGST) independently against lineSubtotal', async () => {
      const prisma = prismaForCreate();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(taxCodeResponse()),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.create(actor, {
        supplierId,
        items: [baseItemInput({ quantity: '10', unitCost: '5.0000', taxCodeId })],
      });

      const item = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.taxComponents.create).toHaveLength(2);
      expect(item.taxAmount.toFixed(4)).toBe('9.0000');
      expect(item.lineTotal.toFixed(4)).toBe('59.0000');
    });

    it('defaults discountPercent to 0 and taxAmount to 0 when neither is provided', async () => {
      const prisma = prismaForCreate();
      const service = createService({ prisma });

      await service.create(actor, {
        supplierId,
        items: [baseItemInput({ quantity: '10', unitCost: '5.0000' })],
      });

      const item = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.discountPercent.toFixed(2)).toBe('0.00');
      expect(item.discountAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxAmount.toFixed(4)).toBe('0.0000');
      expect(item.taxCodeId).toBeNull();
      expect(item.taxComponents.create).toEqual([]);
    });

    it('accepts an active ProductUnit alternative and snapshots its conversionFactor', async () => {
      const prisma = prismaForCreate();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest.fn().mockResolvedValue(
          defaultUomOptions({
            alternatives: [
              {
                unitOfMeasureId: altUnitOfMeasureId,
                code: 'BOX',
                name: 'Box of 12',
                conversionFactor: '12.000000',
                sellingPrice: '90.0000',
              },
            ],
          }),
        ),
      });
      const service = createService({ prisma, inventoryProducts });

      await service.create(actor, {
        supplierId,
        items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
      });

      const item = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.unitOfMeasureId).toBe(altUnitOfMeasureId);
      expect(item.uomCode).toBe('BOX');
      expect(item.conversionFactor.toFixed(6)).toBe('12.000000');
    });

    it('rejects an alternate UOM whose conversionFactor is missing rather than defaulting it to 1', async () => {
      const prisma = prismaForCreate();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest.fn().mockResolvedValue(
          defaultUomOptions({
            alternatives: [
              {
                unitOfMeasureId: altUnitOfMeasureId,
                code: 'BOX',
                name: 'Box of 12',
                conversionFactor: '',
                sellingPrice: '90.0000',
              },
            ],
          }),
        ),
      });
      const service = createService({ prisma, inventoryProducts });

      await expect(
        service.create(actor, {
          supplierId,
          items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an alternate UOM whose conversionFactor is zero/non-positive rather than defaulting it to 1', async () => {
      const prisma = prismaForCreate();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest.fn().mockResolvedValue(
          defaultUomOptions({
            alternatives: [
              {
                unitOfMeasureId: altUnitOfMeasureId,
                code: 'BOX',
                name: 'Box of 12',
                conversionFactor: '0',
                sellingPrice: '90.0000',
              },
            ],
          }),
        ),
      });
      const service = createService({ prisma, inventoryProducts });

      await expect(
        service.create(actor, {
          supplierId,
          items: [baseItemInput({ unitOfMeasureId: altUnitOfMeasureId })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a unitOfMeasureId that is neither the base unit nor an active alternative', async () => {
      const prisma = prismaForCreate();
      const service = createService({ prisma });

      await expect(
        service.create(actor, {
          supplierId,
          items: [
            baseItemInput({ unitOfMeasureId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('matches the approved worked example exactly (subtotal 450 / discount 35 / tax 74.7 / grand total 489.7)', async () => {
      const prisma = prismaForCreate();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'GST', name: null, rate: '18.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.create(actor, {
        supplierId,
        items: [
          // Line 1: 10 × 25 = 250; 10% discount = 25; subtotal 225; 18% tax = 40.5; total 265.5
          baseItemInput({
            quantity: '10',
            unitCost: '25.0000',
            discountPercent: '10',
            taxCodeId,
          }),
          // Line 2: 20 × 10 = 200; 5% discount = 10; subtotal 190; 18% tax = 34.2; total 224.2
          baseItemInput({
            quantity: '20',
            unitCost: '10.0000',
            discountPercent: '5',
            taxCodeId,
          }),
        ],
      });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      const [line1, line2] = data.items.create as Array<{
        lineSubtotal: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }>;
      expect(line1.lineSubtotal.toFixed(4)).toBe('225.0000');
      expect(line1.taxAmount.toFixed(4)).toBe('40.5000');
      expect(line1.lineTotal.toFixed(4)).toBe('265.5000');
      expect(line2.lineSubtotal.toFixed(4)).toBe('190.0000');
      expect(line2.taxAmount.toFixed(4)).toBe('34.2000');
      expect(line2.lineTotal.toFixed(4)).toBe('224.2000');

      expect(data.subtotal.toFixed(4)).toBe('450.0000');
      expect(data.discountTotal.toFixed(4)).toBe('35.0000');
      expect(data.taxTotal.toFixed(4)).toBe('74.7000');
      expect(data.total.toFixed(4)).toBe('489.7000');
    });

    it('persists an alternate-UOM quantity in the selected commercial UOM, never pre-multiplied by the conversion factor (2 BOX stays 2, not 20)', async () => {
      const prisma = prismaForCreate();
      const inventoryProducts = defaultInventoryProducts({
        getUomOptions: jest.fn().mockResolvedValue(
          defaultUomOptions({
            alternatives: [
              {
                unitOfMeasureId: altUnitOfMeasureId,
                code: 'BOX',
                name: 'Box of 10',
                conversionFactor: '10',
                sellingPrice: '90.0000',
              },
            ],
          }),
        ),
      });
      const service = createService({ prisma, inventoryProducts });

      await service.create(actor, {
        supplierId,
        items: [
          baseItemInput({
            quantity: '2',
            unitOfMeasureId: altUnitOfMeasureId,
          }),
        ],
      });

      const item = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data.items.create[0];
      expect(item.quantity.toFixed(6)).toBe('2.000000');
      expect(item.conversionFactor.toFixed(6)).toBe('10.000000');
    });

    it('computes document discountTotal/taxTotal/total across multiple lines', async () => {
      const prisma = prismaForCreate();
      const accountingTaxCodes = defaultAccountingTaxCodes({
        getById: jest.fn().mockResolvedValue(
          taxCodeResponse({
            components: [
              { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            ],
          }),
        ),
      });
      const service = createService({ prisma, accountingTaxCodes });

      await service.create(actor, {
        supplierId,
        items: [
          baseItemInput({ quantity: '10', unitCost: '5.0000' }),
          baseItemInput({
            quantity: '2',
            unitCost: '25.0000',
            discountPercent: '10',
            taxCodeId,
          }),
        ],
      });

      const data = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0]
        .data;
      expect(data.subtotal.toFixed(4)).toBe('100.0000');
      expect(data.discountTotal.toFixed(4)).toBe('5.0000');
      expect(data.taxTotal.toFixed(4)).toBe('4.0500');
      expect(data.total.toFixed(4)).toBe('99.0500');
    });
  });
});
