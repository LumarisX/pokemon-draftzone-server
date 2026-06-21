import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
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

    // Routes with no matching controller never reach our code, so Nest
    // throws its own NotFoundException (no `.code`) instead of a PDZError.
    // Map that case to our SYS-005 shape for a consistent error contract.
    const isUnroutedRequest = status === 404 && !exceptionResponse?.code;
    const notFound = ErrorCodes.SYSTEM.NOT_FOUND;

    const errorCode = isUnroutedRequest
      ? notFound.code
      : exceptionResponse.code || `ERR-${status}`;
    const errorMessage = isUnroutedRequest
      ? notFound.message
      : exceptionResponse.message || exception.message;

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
