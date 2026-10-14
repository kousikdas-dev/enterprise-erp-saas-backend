import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto, UpdateProductDto } from './product.dto';

/** Mirrors the global ValidationPipe config in libs/common/src/bootstrap/bootstrap-http.ts. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

describe('Product gateway DTO validation', () => {
  const categoryId = '33333333-aaaa-4aaa-8aaa-333333333333';
  const unitId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const templateId = '77777777-aaaa-4aaa-8aaa-777777777777';

  describe('CreateProductDto', () => {
    it('accepts the exact payload the Angular product form sends (regression: 400 "property X should not exist")', async () => {
      const dto = plainToInstance(CreateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        description: 'A widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.9900',
        costPrice: '10.0000',
        productType: 'GOODS',
        trackInventory: true,
        barcode: '1234567890',
        note: 'Fragile',
        templateProductId: templateId,
        attributeValueIds: [],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid productType', async () => {
      const dto = plainToInstance(CreateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        productType: 'NOT_A_TYPE',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const productTypeError = errors.find((e) => e.property === 'productType');
      expect(productTypeError?.constraints).toHaveProperty('isEnum');
    });

    it('still rejects an unrelated unknown property (whitelist remains enforced)', async () => {
      const dto = plainToInstance(CreateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.99',
        costPrice: '10',
        notAField: 'nope',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const unknownError = errors.find((e) => e.property === 'notAField');
      expect(unknownError?.constraints).toHaveProperty('whitelistValidation');
    });
  });

  describe('UpdateProductDto', () => {
    it('accepts the exact payload the Angular product form sends on edit (regression: 400 "property X should not exist")', async () => {
      const dto = plainToInstance(UpdateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        description: 'A widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.9900',
        costPrice: '10.0000',
        isActive: true,
        productType: 'GOODS',
        trackInventory: true,
        barcode: '1234567890',
        note: 'Fragile',
        templateProductId: templateId,
        attributeValueIds: [],
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it.each(['description', 'barcode', 'note', 'templateProductId'] as const)(
      'accepts explicit null for %s (clear semantics, matches inventory-service)',
      async (field) => {
        const dto = plainToInstance(UpdateProductDto, { [field]: null });

        const errors = await validate(dto, PIPE_OPTIONS);
        expect(errors).toHaveLength(0);
      },
    );

    it('still rejects an unrelated unknown property (whitelist remains enforced)', async () => {
      const dto = plainToInstance(UpdateProductDto, {
        name: 'Widget',
        notAField: 'nope',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const unknownError = errors.find((e) => e.property === 'notAField');
      expect(unknownError?.constraints).toHaveProperty('whitelistValidation');
    });
  });
});
