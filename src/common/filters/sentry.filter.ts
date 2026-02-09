import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { Request } from 'express';
import { isAxiosError } from 'axios';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message:
              exception instanceof Error && !isAxiosError(exception)
                ? exception.message
                : 'Internal server error',
            timestamp: new Date().toISOString(),
            path: request.url,
          };

    // ✅ Capture exception in background
    setImmediate(async () => {
      try {
        Sentry.setUser({
          id: (request as any).user?.id,
          email: (request as any).user?.email,
        });

        Sentry.setContext('request', {
          method: request.method,
          url: request.url,
          body: request.body,
          query: request.query,
          ip: request.ip,
        });

        Sentry.setTag('route', request.url);
        Sentry.setTag('environment', process.env.NODE_ENV);

        Sentry.captureException(exception);
        await Sentry.flush(2000);
      } catch (err) {
        console.error('⚠️ Sentry capture failed:', err);
      }
    });

    // Send HTTP response
    httpAdapter.reply(response, responseBody, status);
  }
}
