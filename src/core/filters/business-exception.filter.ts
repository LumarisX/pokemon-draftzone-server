import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { Response } from "express";
import { ErrorCodes } from "../pdz-error-codes";

@Catch(HttpException)
export class BusinessExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
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

    response.status(status).json({
      error: {
        code: errorCode,
        message: errorMessage,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
