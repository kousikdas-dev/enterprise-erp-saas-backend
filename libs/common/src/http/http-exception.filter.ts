import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from './api-response';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const message = this.resolveMessage(exception);
    const error = this.resolveErrorName(exception, status);

    const body: ApiErrorResponse = {
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(
      `${request.method} ${request.url} ${status} ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(body);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveErrorName(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      return exception.name;
    }
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'InternalServerError'
      : 'Error';
  }

  private resolveMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return payload;
      }
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const message = (payload as { message: string | string[] }).message;
        return message;
      }
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Unexpected error';
  }
}
