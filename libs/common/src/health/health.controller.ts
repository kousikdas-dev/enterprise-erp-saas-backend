import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Versioned service health check' })
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => ({
        service: {
          status: 'up' as const,
          name: this.config.get<string>('SERVICE_NAME') ?? 'unknown',
        },
      }),
    ]);
  }
}

@ApiTags('health')
@Controller('health')
export class RootHealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Unversioned health endpoint for orchestrators' })
  live() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => ({
        service: {
          status: 'up' as const,
          name: this.config.get<string>('SERVICE_NAME') ?? 'unknown',
        },
      }),
    ]);
  }
}
