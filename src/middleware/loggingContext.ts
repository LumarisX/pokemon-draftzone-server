import { Request, Response, NextFunction } from 'express';
import { randomUUID, createHash } from 'crypto';
import winston from 'winston';
import { logger } from '../app';

declare global {
  namespace Express {
    interface Request {
      id: string;
      logger: winston.Logger;
      bodyLength: number;
      bodyHash: string;
    }
  }
}

/**
 * Generates a unique request ID, calculates body length and hash, creates a
 * request-specific logger, and attaches them to the request object.
 */
export function loggingContext(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  const userId = req.auth?.payload?.sub || 'unauthenticated';

  let bodyLength = 0;
  let bodyHash = 'no-body';

  if (req.body && Object.keys(req.body).length > 0) {
    const bodyString = JSON.stringify(req.body);
    bodyLength = bodyString.length;
    bodyHash = createHash('sha256').update(bodyString).digest('hex');
  }

  req.id = id;
  req.bodyLength = bodyLength;
  req.bodyHash = bodyHash;
  req.logger = logger.child({
    requestId: id,
    userId: userId,
    bodyLength: bodyLength,
    bodyHash: bodyHash,
  });

  res.setHeader('X-Request-Id', id);

  next();
}
