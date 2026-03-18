import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches all unhandled exceptions (non-HttpException) — e.g. TypeORM QueryFailedError.
 * Logs a structured, readable message and returns a generic 500 to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('UnhandledException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const method = request.method;
    const url = request.url;
    const status = HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : String(exception);

    this.logger.error(
      `${method} ${url} → 500 Internal Server Error`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Surface a short, actionable hint for TypeORM UUID errors
    const isUuidError =
      exception instanceof Error && exception.message.includes('invalid input syntax for type uuid');

    response.status(status).json({
      statusCode: status,
      error: 'Internal Server Error',
      message: isUuidError
        ? 'Database query error: a parameter was passed as an object instead of a UUID string. Check the server logs.'
        : 'An unexpected error occurred. Please try again.',
    });
  }
}
