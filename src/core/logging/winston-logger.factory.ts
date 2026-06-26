import fs from "fs";
import path from "path";
import winston from "winston";
import "winston-daily-rotate-file";

export function createAppLogger(logDir: string): winston.Logger {
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir);
      console.log(`Log directory created: ${logDir}`);
    } catch (err) {
      console.error(`Could not create log directory: ${logDir}`, err);
    }
  }

  const logger = winston.createLogger({
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, "app-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "14d",
      }),
      new winston.transports.DailyRotateFile({
        filename: path.join(logDir, "app-error-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "30d",
        level: "error",
      }),
    ],
  });

  if (process.env.NODE_ENV !== "production") {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format.printf(
            (info) =>
              `${info.timestamp} ${info.level}: ${info.message} ${
                info.stack || ""
              }`,
          ),
        ),
      }),
    );
  } else {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json(),
        ),
        stderrLevels: ["error"],
      }),
    );
  }

  return logger;
}
