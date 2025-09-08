import { Request, Response, NextFunction } from "express";
import { logger } from "../app";

const toMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const formatMemory = (usage: NodeJS.MemoryUsage) =>
  Object.fromEntries(
    Object.entries(usage).map(([key, value]) => [key, toMB(value)])
  );

export function logMemoryUsage(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startUsage = process.memoryUsage();
  logger.debug(`[Memory] Start: ${req.method} ${req.originalUrl}`, {
    memory: formatMemory(startUsage),
  });

  res.on("finish", () => {
    const endUsage = process.memoryUsage();
    const delta = Object.fromEntries(
      Object.entries(endUsage).map(([key, value]) => [
        key,
        toMB(value - startUsage[key as keyof NodeJS.MemoryUsage]),
      ])
    ) as Record<keyof NodeJS.MemoryUsage, string>;

    logger.debug(`[Memory] End: ${req.method} ${req.originalUrl}`, {
      statusCode: res.statusCode,
      endMemory: formatMemory(endUsage),
      delta,
    });
  });

  next();
}
