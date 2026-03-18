import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { translateMessage } from '../i18n/messages';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Detect locale from Accept-Language header (first segment, e.g. "fr" from "fr-FR,fr;q=0.9")
    const acceptLanguage = (request.headers['accept-language'] as string | undefined) ?? 'en';
    const locale = acceptLanguage.split(/[-;,]/)[0].trim().toLowerCase();

    const exceptionResponse = exception.getResponse();

    // NestJS wraps validation errors as { message: string[], error: string, statusCode: number }
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const body = exceptionResponse as Record<string, unknown>;

      // Price guard structured response — translate inner message but keep structure
      if (body['warning'] === true) {
        const translatedMsg = translateMessage(
          typeof body['message'] === 'string' ? body['message'] : '',
          locale,
        );
        response.status(status).json({ ...body, message: translatedMsg });
        return;
      }

      // Array of validation messages (class-validator)
      if (Array.isArray(body['message'])) {
        response.status(status).json({
          statusCode: status,
          error: body['error'] ?? HttpStatus[status],
          message: (body['message'] as string[]).map((m) => translateMessage(m, locale)),
        });
        return;
      }

      // Single string message
      if (typeof body['message'] === 'string') {
        response.status(status).json({
          statusCode: status,
          error: body['error'] ?? HttpStatus[status],
          message: translateMessage(body['message'], locale),
        });
        return;
      }
    }

    // Plain string response
    if (typeof exceptionResponse === 'string') {
      response.status(status).json({
        statusCode: status,
        message: translateMessage(exceptionResponse, locale),
      });
      return;
    }

    response.status(status).json(exceptionResponse);
  }
}
