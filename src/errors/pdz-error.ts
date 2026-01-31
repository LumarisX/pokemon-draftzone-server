import { ErrorDefinition } from "./error-codes";

export class PDZError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: any;
  public readonly timestamp: Date;

  constructor(errorDef: ErrorDefinition, details?: any) {
    super(errorDef.message);
    this.name = "PDZError";
    this.code = errorDef.code;
    this.status = errorDef.status;
    this.details = details;
    this.timestamp = new Date();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
      meta: {
        timestamp: this.timestamp.toISOString(),
      },
    };
  }
}

export function isPDZError(error: any): error is PDZError {
  return error instanceof PDZError;
}
