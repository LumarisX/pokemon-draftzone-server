import { ErrorRequestHandler } from "express";
import { logger } from "../app";
import { config } from "../config";
import { isPDZError } from "./pdz-error";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const log = req.logger || logger;

  const isKnownError = isPDZError(err);
  const status = isKnownError ? err.status : err.status || 500;
  const code = isKnownError ? err.code : err.code || "INTERNAL_ERROR";
  const message = err.message || "Internal server error";

  log.error("Request error", {
    error: {
      code,
      message,
      status,
      stack: err.stack,
      ...(isKnownError && err.details && { details: err.details }),
    },
    request: {
      id: req.id,
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userId: req.auth?.payload?.sub,
    },
  });

  const response: any = {
    error: {
      code,
      message,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  };

  if (config.NODE_ENV === "development") {
    response.error.stack = err.stack;
    if (isKnownError && err.details) {
      response.error.details = err.details;
    }
  }

  res.status(status).json(response);
};
