import { Test } from '@nestjs/testing';
import { AccountingModule } from './accounting.module';

describe('AccountingModule', () => {
  it('compiles the accounting service foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccountingModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
