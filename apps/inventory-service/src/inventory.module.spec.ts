import { Test } from '@nestjs/testing';
import { InventoryModule } from './inventory.module';

describe('InventoryModule', () => {
  it('compiles the inventory service foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InventoryModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
