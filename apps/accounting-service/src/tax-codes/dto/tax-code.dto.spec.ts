import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaxComponentType } from '../../../generated/prisma-client';
import { CreateTaxCodeDto, UpdateTaxCodeDto } from './tax-code.dto';

describe('Tax Code DTO validation', () => {
  const validComponents = [
    { sequence: 1, type: TaxComponentType.CGST, rate: '9' },
    { sequence: 2, type: TaxComponentType.SGST, rate: '9' },
  ];

  describe('CreateTaxCodeDto', () => {
    it('accepts a valid code and name', async () => {
      const dto = plainToInstance(CreateTaxCodeDto, {
        code: 'GST18_LOCAL',
        name: 'GST 18% Local',
        components: validComponents,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a whitespace-only code', async () => {
      const dto = plainToInstance(CreateTaxCodeDto, {
        code: '   ',
        name: 'GST 18% Local',
        components: validComponents,
      });

      const errors = await validate(dto);
      const codeError = errors.find((error) => error.property === 'code');
      expect(codeError?.constraints).toHaveProperty('matches');
    });

    it('rejects a whitespace-only name', async () => {
      const dto = plainToInstance(CreateTaxCodeDto, {
        code: 'GST18_LOCAL',
        name: '\t\n ',
        components: validComponents,
      });

      const errors = await validate(dto);
      const nameError = errors.find((error) => error.property === 'name');
      expect(nameError?.constraints).toHaveProperty('matches');
    });
  });

  describe('UpdateTaxCodeDto', () => {
    it('accepts omitting code and name entirely', async () => {
      const dto = plainToInstance(UpdateTaxCodeDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects a whitespace-only code when provided', async () => {
      const dto = plainToInstance(UpdateTaxCodeDto, { code: '   ' });

      const errors = await validate(dto);
      const codeError = errors.find((error) => error.property === 'code');
      expect(codeError?.constraints).toHaveProperty('matches');
    });

    it('rejects a whitespace-only name when provided', async () => {
      const dto = plainToInstance(UpdateTaxCodeDto, { name: '   ' });

      const errors = await validate(dto);
      const nameError = errors.find((error) => error.property === 'name');
      expect(nameError?.constraints).toHaveProperty('matches');
    });
  });
});
