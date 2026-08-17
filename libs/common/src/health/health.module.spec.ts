import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthController, HealthModule, RootHealthController } from './health.module';

describe('HealthModule', () => {
  it('registers versioned and root health controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ SERVICE_NAME: 'health-test' })],
        }),
        HealthModule,
      ],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeDefined();
    expect(moduleRef.get(RootHealthController)).toBeDefined();
    await moduleRef.close();
  });
});
