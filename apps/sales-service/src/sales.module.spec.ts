import { Test } from '@nestjs/testing';
import { SalesModule } from './sales.module';

describe('SalesModule', () => {
  it('compiles the sales service foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SalesModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
