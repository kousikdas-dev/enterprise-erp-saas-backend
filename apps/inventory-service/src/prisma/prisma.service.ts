import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    await this.$connect();
    this.logger.log('Connected to inventory_db');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
