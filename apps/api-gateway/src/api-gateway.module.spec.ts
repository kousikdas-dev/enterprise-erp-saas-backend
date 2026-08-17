import { Test } from '@nestjs/testing';
import { ApiGatewayModule } from './api-gateway.module';

describe('ApiGatewayModule', () => {
  it('compiles the API gateway foundation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
