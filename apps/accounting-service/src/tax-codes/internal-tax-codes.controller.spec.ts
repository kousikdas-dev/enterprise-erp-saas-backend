import { NotFoundException } from '@nestjs/common';
import { InternalTaxCodesController } from './internal-tax-codes.controller';
import { TaxCodesService } from './tax-codes.service';

describe('InternalTaxCodesController', () => {
  const actor = {
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  function taxCode(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tc-1',
      tenantId: actor.tenantId,
      code: 'GST18_LOCAL',
      name: 'GST 18% Local',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      components: [
        {
          id: 'comp-1',
          tenantId: actor.tenantId,
          taxCodeId: 'tc-1',
          sequence: 1,
          type: 'CGST',
          name: null,
          rate: '9.0000',
          accountId: 'acc-revenue',
          account: { id: 'acc-revenue', code: '4000', name: 'Revenue' },
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'comp-2',
          tenantId: actor.tenantId,
          taxCodeId: 'tc-1',
          sequence: 2,
          type: 'SGST',
          name: null,
          rate: '9.0000',
          accountId: null,
          account: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ],
      ...overrides,
    };
  }

  function createController() {
    const taxCodes = { list: jest.fn(), getById: jest.fn() };
    const controller = new InternalTaxCodesController(
      taxCodes as unknown as TaxCodesService,
    );
    return { controller, taxCodes };
  }

  it('returns all tax codes trimmed to the internal shape when activeOnly is not provided', async () => {
    const { controller, taxCodes } = createController();
    const active = taxCode();
    const inactive = taxCode({
      id: 'tc-2',
      code: 'GST0',
      name: 'GST Exempt',
      isActive: false,
      components: [],
    });
    taxCodes.list.mockResolvedValue({ items: [active, inactive] });

    const result = await controller.list(actor, undefined);

    expect(result).toEqual({
      items: [
        {
          id: 'tc-1',
          code: 'GST18_LOCAL',
          name: 'GST 18% Local',
          description: null,
          isActive: true,
          components: [
            { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
            { id: 'comp-2', sequence: 2, type: 'SGST', name: null, rate: '9.0000' },
          ],
        },
        {
          id: 'tc-2',
          code: 'GST0',
          name: 'GST Exempt',
          description: null,
          isActive: false,
          components: [],
        },
      ],
    });
  });

  it('filters out inactive tax codes when activeOnly=true', async () => {
    const { controller, taxCodes } = createController();
    const active = taxCode();
    const inactive = taxCode({ id: 'tc-2', isActive: false });
    taxCodes.list.mockResolvedValue({ items: [active, inactive] });

    const result = await controller.list(actor, 'true');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('tc-1');
  });

  it('does not filter when activeOnly is not exactly "true"', async () => {
    const { controller, taxCodes } = createController();
    const active = taxCode();
    const inactive = taxCode({ id: 'tc-2', isActive: false });
    taxCodes.list.mockResolvedValue({ items: [active, inactive] });

    const result = await controller.list(actor, 'false');

    expect(result.items).toHaveLength(2);
  });

  it('excludes tenantId, timestamps, taxCodeId, accountId, and account from the response', async () => {
    const { controller, taxCodes } = createController();
    taxCodes.list.mockResolvedValue({ items: [taxCode()] });

    const result = await controller.list(actor, undefined);
    const [taxCodeResult] = result.items;

    expect(Object.keys(taxCodeResult).sort()).toEqual(
      ['id', 'code', 'name', 'description', 'isActive', 'components'].sort(),
    );
    expect(Object.keys(taxCodeResult.components[0]).sort()).toEqual(
      ['id', 'sequence', 'type', 'name', 'rate'].sort(),
    );
  });

  it("returns the tenant-scoped tax code trimmed to the internal shape via getById", async () => {
    const { controller, taxCodes } = createController();
    taxCodes.getById.mockResolvedValue(taxCode());

    const result = await controller.getById(actor, 'tc-1');

    expect(result).toEqual({
      id: 'tc-1',
      code: 'GST18_LOCAL',
      name: 'GST 18% Local',
      description: null,
      isActive: true,
      components: [
        { id: 'comp-1', sequence: 1, type: 'CGST', name: null, rate: '9.0000' },
        { id: 'comp-2', sequence: 2, type: 'SGST', name: null, rate: '9.0000' },
      ],
    });
  });

  it('propagates a 404 when the tax code does not exist for the calling tenant', async () => {
    const { controller, taxCodes } = createController();
    taxCodes.getById.mockRejectedValue(
      new NotFoundException('Tax code not found'),
    );

    await expect(controller.getById(actor, 'tc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('passes the current ActorContext to both service methods', async () => {
    const { controller, taxCodes } = createController();
    taxCodes.list.mockResolvedValue({ items: [] });
    taxCodes.getById.mockResolvedValue(taxCode());

    await controller.list(actor, undefined);
    await controller.getById(actor, 'tc-1');

    expect(taxCodes.list).toHaveBeenCalledWith(actor);
    expect(taxCodes.getById).toHaveBeenCalledWith(actor, 'tc-1');
  });
});
