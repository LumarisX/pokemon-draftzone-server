import mongoose from "mongoose";
import winston from "winston";
import { logger } from "./app";
import { config } from "./config";

export function connectDB(logger: winston.Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    const connectionUri = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

    const handleInitialError = (error: Error) => {
      logger.error("Initial MongoDB connection failed:", error);
      mongoose.connection.off("connected", handleInitialConnect);
      reject(error);
    };

    const handleInitialConnect = () => {
      logger.info("MongoDB Connected successfully (via event).");
      mongoose.connection.off("error", handleInitialError);
      resolve();
    };

    mongoose.connection.once("error", handleInitialError);
    mongoose.connection.once("connected", handleInitialConnect);
    logger.info("Attempting MongoDB connection...");
    mongoose.connect(connectionUri).catch((error) => {
      logger.error("mongoose.connect() failed to initiate:", error);
      mongoose.connection.off("connected", handleInitialConnect);
      mongoose.connection.off("error", handleInitialError);
      reject(error);
    });
  });
}

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected.");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB reconnected.");
});

mongoose.connection.on("error", (error) => {
  logger.error("MongoDB connection error (post-initial connection):", error);
});
