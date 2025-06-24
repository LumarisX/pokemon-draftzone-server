import debug from "debug";
import http from "http";
import mongoose from "mongoose";
import { app, logger } from "./app";
import { config } from "./config";
import { startDiscordBot } from "./discord";
import { connectDB } from "./database";
import { startWebSocket } from "./websocket";

const debugLogger = debug("tpl-express-pro:server");

function normalizePort(
  val: string | number | undefined
): number | string | boolean {
  if (!val) {
    return false;
  }
  const port = parseInt(val.toString(), 10);
  if (isNaN(port)) {
    return val.toString();
  }
  if (port >= 0) {
    return port;
  }
  return false;
}

function onError(
  error: NodeJS.ErrnoException,
  port: number | string | boolean
): void {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  switch (error.code) {
    case "EACCES":
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening(server: http.Server): void {
  const addr = server.address();
  if (!addr) {
    logger.error("Server address is null after listening started.");
    return;
  }
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  debugLogger("Listening on " + bind);
  logger.info(`Server listening on ${bind}`);
}

function setupGracefulShutdown(server: http.Server) {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async (err) => {
        if (err) {
          logger.error("Error closing HTTP server:", err);
          process.exit(1);
        } else {
          logger.info("HTTP server closed.");
        }
        try {
          await mongoose.connection.close();
          logger.info("MongoDB connection closed.");
        } catch (dbErr) {
          logger.error("Error closing MongoDB connection:", dbErr);
        }
        process.exit(0);
      });
      setTimeout(() => {
        logger.warn("Graceful shutdown timed out. Forcing exit.");
        process.exit(1);
      }, 10000);
    });
  });
}

(async () => {
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", { promise, reason });
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    logger.info("Attempting graceful shutdown due to uncaught exception...");
    process.exit(1);
  });

  try {
    await connectDB(logger);
    logger.info("connectDB() promise resolved.");

    const port = normalizePort(config.PORT || "9960");
    if (port === false) {
      throw new Error(`Invalid port specified: ${config.PORT || "9960"}`);
    }
    app.set("port", port);

    const server = http.createServer(app);

    startWebSocket(logger, server);

    server.on("error", (error: NodeJS.ErrnoException) => onError(error, port));
    server.on("listening", () => onListening(server));

    server.listen(port);

    await startDiscordBot(logger);

    setupGracefulShutdown(server);
  } catch (error) {
    const log = typeof logger !== "undefined" ? logger.error : console.error;
    log("Failed to start server:", error);
    process.exit(1);
  }
})();
export class PZError extends Error {
  constructor(public status: number, message?: string) {
    super(message);
    Object.setPrototypeOf(this, PZError.prototype);
  }
}
