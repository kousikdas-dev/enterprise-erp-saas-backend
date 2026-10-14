import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './product.dto';

/** Mirrors the global ValidationPipe config in libs/common/src/bootstrap/bootstrap-http.ts. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

describe('Product DTO validation', () => {
  const categoryId = '33333333-aaaa-4aaa-8aaa-333333333333';
  const unitId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const templateId = '77777777-aaaa-4aaa-8aaa-777777777777';

  describe('CreateProductDto', () => {
    it('accepts productType, trackInventory, barcode, and note', async () => {
      const dto = plainToInstance(CreateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        categoryId,
        unitOfMeasureId: unitId,
        sellingPrice: '19.9900',
        costPrice: '10.0000',
        productType: 'GOODS',
        trackInventory: true,
        barcode: '1234567890',
        note: 'Fragile',
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
  });

  describe('UpdateProductDto', () => {
    it('accepts productType, trackInventory, barcode, and note (regression for the gateway whitelist rejection)', async () => {
      const dto = plainToInstance(UpdateProductDto, {
        sku: 'SKU-001',
        name: 'Widget',
        productType: 'SERVICE',
        trackInventory: false,
        barcode: '1234567890',
        note: 'Fragile',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it.each(['description', 'barcode', 'note', 'templateProductId'] as const)(
      'accepts explicit null for %s (clear semantics)',
      async (field) => {
        const dto = plainToInstance(UpdateProductDto, { [field]: null });

        const errors = await validate(dto, PIPE_OPTIONS);
        expect(errors).toHaveLength(0);
      },
    );

    it('still rejects an invalid templateProductId string', async () => {
      const dto = plainToInstance(UpdateProductDto, {
        templateProductId: 'not-a-uuid',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const templateError = errors.find((e) => e.property === 'templateProductId');
      expect(templateError?.constraints).toHaveProperty('isUuid');
    });

    it('accepts a valid templateProductId UUID', async () => {
      const dto = plainToInstance(UpdateProductDto, {
        templateProductId: templateId,
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

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

  describe('ProductQueryDto', () => {
    it('accepts a valid templateProductId filter', async () => {
      const dto = plainToInstance(ProductQueryDto, {
        templateProductId: templateId,
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it('accepts an omitted templateProductId filter', async () => {
      const dto = plainToInstance(ProductQueryDto, {});

      const errors = await validate(dto, PIPE_OPTIONS);
      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid templateProductId filter (would otherwise 500 on a raw Prisma lookup)', async () => {
      const dto = plainToInstance(ProductQueryDto, {
        templateProductId: 'not-a-uuid',
      });

      const errors = await validate(dto, PIPE_OPTIONS);
      const templateError = errors.find((e) => e.property === 'templateProductId');
      expect(templateError?.constraints).toHaveProperty('isUuid');
    });
  });
});
