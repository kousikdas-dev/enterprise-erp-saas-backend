import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { wrapSuccess } from './api-response';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (this.shouldBypass(request.url)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => wrapSuccess(data, response.statusCode)),
    );
  }

  private shouldBypass(url: string): boolean {
    return url.includes('/health') || url.includes('/docs') || url.includes('/swagger');
  }
}
