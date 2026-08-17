import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

export const EVENT_BUS = 'EVENT_BUS';

@Module({})
export class MessagingModule {
  static register(): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: EVENT_BUS,
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              transport: Transport.RMQ,
              options: {
                urls: [config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672'],
                queue: config.get<string>('RABBITMQ_QUEUE') ?? 'erp.events',
                queueOptions: { durable: true },
              },
            }),
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
