import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { z, ZodError, ZodType } from "zod";

type ValidationSource = "body" | "query" | "params";

function mapValidationError(
  error: ZodError,
  source: ValidationSource,
): PDZError {
  const errorCode =
    source === "body"
      ? ErrorCodes.VALIDATION.INVALID_BODY
      : ErrorCodes.VALIDATION.INVALID_PARAMS;

  return new PDZError(errorCode, {
    source,
    issues: error.issues,
  });
}

function parseOrThrow<T>(
  schema: ZodType<T>,
  value: unknown,
  source: ValidationSource,
): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw mapValidationError(error, source);
    }
    throw error;
  }
}

export function validateBody<T>(schema: ZodType<T>, value: unknown): T {
  return parseOrThrow(schema, value, "body");
}

export function validateQuery<T>(schema: ZodType<T>, value: unknown): T {
  return parseOrThrow(schema, value, "query");
}

export function validateParams<T>(schema: ZodType<T>, value: unknown): T {
  return parseOrThrow(schema, value, "params");
}

export { z };
