import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  GoodsReceiptStatus,
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma-client';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { InventoryStockClient } from '../inventory/inventory-stock.client';
import { GoodsReceiptsService } from './goods-receipts.service';

describe('GoodsReceiptsService', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const poId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const poItemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const productId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const warehouseId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  function createService() {
    const prisma = {
      purchaseOrder: { findFirst: jest.fn() },
      goodsReceipt: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrderItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseOrder: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    // fix duplicate key - rewrite properly
    return prisma;
  }

  it('rejects over-receipt against remaining quantity', async () => {
    const tx = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: poId,
          tenantId: actor.tenantId,
          status: PurchaseOrderStatus.CONFIRMED,
          items: [
            {
              id: poItemId,
              tenantId: actor.tenantId,
              productId,
              quantity: new Prisma.Decimal('10'),
              receivedQuantity: new Prisma.Decimal('8'),
            },
          ],
        }),
      },
      goodsReceipt: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
      goodsReceipt: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
      purchaseOrder: { update: jest.fn() },
    };
    const inventory = {
      applyReceipt: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const service = new GoodsReceiptsService(
      prisma as never,
      inventory as unknown as InventoryStockClient,
      audit as unknown as IdentityAuditClient,
    );

    await expect(
      service.create(actor, {
        purchaseOrderId: poId,
        warehouseId,
        items: [{ purchaseOrderItemId: poItemId, quantity: '5' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  it('posts an already POSTED receipt idempotently', async () => {
    const posted = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId: actor.tenantId,
      purchaseOrderId: poId,
      warehouseId,
      status: GoodsReceiptStatus.POSTED,
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
      purchaseOrder: { items: [] },
    };
    const prisma = {
      goodsReceipt: { findFirst: jest.fn().mockResolvedValue(posted) },
      $transaction: jest.fn(),
      purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
      purchaseOrder: { update: jest.fn() },
    };
    const inventory = { applyReceipt: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new GoodsReceiptsService(
      prisma as never,
      inventory as unknown as InventoryStockClient,
      audit as unknown as IdentityAuditClient,
    );

    const result = await service.post(actor, posted.id);
    expect(result.status).toBe(GoodsReceiptStatus.POSTED);
    expect(inventory.applyReceipt).not.toHaveBeenCalled();
  });

  it('returns 404 for missing receipt', async () => {
    const prisma = {
      goodsReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
      purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
      purchaseOrder: { update: jest.fn() },
    };
    const service = new GoodsReceiptsService(
      prisma as never,
      { applyReceipt: jest.fn() } as unknown as InventoryStockClient,
      { record: jest.fn() } as unknown as IdentityAuditClient,
    );
    await expect(service.getById(actor, poId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
