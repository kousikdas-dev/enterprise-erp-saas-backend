import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'accessToken',
            'refreshToken',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
})
export class LoggingModule {}
