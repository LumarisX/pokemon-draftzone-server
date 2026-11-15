import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { ErrorCodes } from "../pdz-error-codes";

@Catch()
export class BusinessExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      this.respondToHttpException(exception, response);
      return;
    }

    const error = exception as any;
    if (error?.name === "CastError" || error instanceof URIError) {
      const invalid = ErrorCodes.VALIDATION.INVALID_PARAMS;
      this.send(response, invalid.status, invalid.code, invalid.message);
      return;
    }

    const clientStatus = error?.status ?? error?.statusCode;
    if (
      error?.expose === true &&
      typeof clientStatus === "number" &&
      clientStatus >= 400 &&
      clientStatus < 500
    ) {
      this.send(response, clientStatus, `ERR-${clientStatus}`, error.message);
      return;
    }

    this.logger.error(
      `Unhandled exception: ${error?.message ?? String(exception)}`,
      error?.stack,
    );
    const internal = ErrorCodes.SYSTEM.INTERNAL_ERROR;
    this.send(response, internal.status, internal.code, internal.message);
  }

  private respondToHttpException(exception: HttpException, response: Response) {
    const status = exception.getStatus();
    const exceptionResponse: any = exception.getResponse();
    const pdzError = exceptionResponse?.error;

    const isUnroutedRequest = status === 404 && !pdzError?.code;
    const notFound = ErrorCodes.SYSTEM.NOT_FOUND;

    const errorCode = isUnroutedRequest
      ? notFound.code
      : pdzError?.code || `ERR-${status}`;
    const errorMessage = isUnroutedRequest
      ? notFound.message
      : pdzError?.message || exceptionResponse?.message || exception.message;
    const errorDetails = isUnroutedRequest ? undefined : pdzError?.details;

    if (status >= 500) {
      this.logger.error(
        `${errorCode}: ${exception.message}`,
        exception.stack,
      );
    }

    this.send(response, status, errorCode, errorMessage, errorDetails);
  }

  private send(
    response: Response,
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    response.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
