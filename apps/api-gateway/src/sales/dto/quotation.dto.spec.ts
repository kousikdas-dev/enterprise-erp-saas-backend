import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuotationDto, UpdateQuotationDto } from './quotation.dto';

/** Mirrors the global ValidationPipe config in libs/common/src/bootstrap/bootstrap-http.ts. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

describe('Quotation gateway DTO validation', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  const unitOfMeasureId = '33333333-3333-4333-8333-333333333333';
  const taxCodeId = '44444444-4444-4444-8444-444444444444';

  const baseItem = {
    productId,
    productSku: 'SKU-1',
    productName: 'Widget',
    quantity: '10',
    unitOfMeasureId,
    unitPrice: '25.0000',
  };

  describe('CreateQuotationDto', () => {
    it('accepts a payload with unitOfMeasureId, discountPercent, and taxCodeId (regression for the Step 40 Save failure)', async () => {
      const dto = plainToInstance(CreateQuotationDto, {
        customerId,
        items: [{ ...baseItem, discountPercent: '10.00', taxCodeId }],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it('accepts an item omitting the optional discountPercent and taxCodeId', async () => {
      const dto = plainToInstance(CreateQuotationDto, {
        customerId,
        items: [baseItem],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it('still rejects an item missing the required unitOfMeasureId', async () => {
      const { unitOfMeasureId: _omit, ...itemWithoutUom } = baseItem;
      const dto = plainToInstance(CreateQuotationDto, {
        customerId,
        items: [itemWithoutUom],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const itemsError = errors.find((error) => error.property === 'items');
      const uomError = itemsError?.children?.[0]?.children?.find(
        (error) => error.property === 'unitOfMeasureId',
      );
      expect(uomError?.constraints).toHaveProperty('isUuid');
    });

    it('still rejects an unrelated unknown property on an item (whitelist remains enforced)', async () => {
      const dto = plainToInstance(CreateQuotationDto, {
        customerId,
        items: [{ ...baseItem, bogusField: 'not allowed' }],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const itemsError = errors.find((error) => error.property === 'items');
      const bogusError = itemsError?.children?.[0]?.children?.find(
        (error) => error.property === 'bogusField',
      );
      expect(bogusError?.constraints).toHaveProperty('whitelistValidation');
    });
  });

  describe('UpdateQuotationDto', () => {
    it('accepts a payload with unitOfMeasureId, discountPercent, and taxCodeId', async () => {
      const dto = plainToInstance(UpdateQuotationDto, {
        items: [{ ...baseItem, discountPercent: '5.5', taxCodeId }],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });
  });
});
