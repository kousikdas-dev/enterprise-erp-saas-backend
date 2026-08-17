import { Test } from '@nestjs/testing';
import { IdentityModule } from './identity.module';

describe('IdentityModule', () => {
  it('compiles the identity service foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
