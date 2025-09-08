import { Request, Response, NextFunction } from "express";

export function logMemoryUsage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.log(`\n--- REQUEST RECEIVED: ${req.method} ${req.originalUrl} ---`);

  const startUsage = process.memoryUsage();
  console.log("--- MEMORY USAGE (START) ---");
  for (const [key, value] of Object.entries(startUsage)) {
    console.log(`${key}: ${Math.round((value / 1024 / 1024) * 100) / 100} MB`);
  }
  console.log("----------------------------");

  res.on("finish", () => {
    console.log(
      `--- RESPONSE FINISHED FOR: ${req.method} ${req.originalUrl} ---`
    );
    const endUsage = process.memoryUsage();
    console.log("--- MEMORY USAGE (END) ---");
    for (const [key, value] of Object.entries(endUsage)) {
      console.log(
        `${key}: ${Math.round((value / 1024 / 1024) * 100) / 100} MB`
      );
    }
    console.log("--------------------------\n");
  });

  next();
}
