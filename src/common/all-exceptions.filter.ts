import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DiscordNotifierService } from './discord-notifier.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly discord: DiscordNotifierService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (() => {
            const res = exception.getResponse();
            return typeof res === 'string'
              ? res
              : (res as { message?: string }).message ?? exception.message;
          })()
        : exception instanceof Error
          ? exception.message
          : String(exception);

    const stack = exception instanceof Error ? exception.stack : undefined;

    // 5xx만 Discord 알림 (4xx는 알림 없음)
    if (statusCode >= 500) {
      void this.discord.notifyError({
        source: 'http',
        title: `HTTP ${statusCode} Error`,
        message,
        stack,
        statusCode,
        requestPath: `${request.method} ${request.url}`,
      });

      this.logger.error(
        `[${statusCode}] ${request.method} ${request.url} — ${message}`,
        stack,
      );
    }

    // NestJS 기본 동작과 동일한 응답 형식 유지
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode,
            message,
            error: 'Internal Server Error',
          };

    response.status(statusCode).json(body);
  }
}
