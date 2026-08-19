import { Test } from '@nestjs/testing';
import { PurchaseModule } from './purchase.module';

describe('PurchaseModule', () => {
  it('compiles the purchase service foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PurchaseModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
