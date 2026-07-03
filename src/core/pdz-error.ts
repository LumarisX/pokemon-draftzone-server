import { HttpException } from "@nestjs/common";
import { ErrorDefinition } from "./pdz-error-codes";

export class PDZError extends HttpException {
  public readonly code: string;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(errorDef: ErrorDefinition, details?: any) {
    super(
      {
        error: {
          code: errorDef.code,
          message: errorDef.message,
          ...(details && { details }),
        },
      },
      errorDef.status,
    );
    this.code = errorDef.code;
    this.details = details;
    this.timestamp = new Date();
    this.message = details?.reason ?? errorDef.message;
  }
}

export function isPDZError(error: any): error is PDZError {
  return error instanceof PDZError;
}
