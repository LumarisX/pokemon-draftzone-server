import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { Logger } from "winston";
import { JsonRpcRequest, sendError } from "./services/websocket.service";
import { registerWsEvents, wsRoutes } from "./ws-routes";

export function startWebSocket(logger: Logger, server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:4200", "https://pokemondraftzone.com"],
      methods: ["GET", "POST"],
    },
    path: "/ws/",
  });

  registerWsEvents(io);

  io.on("connection", (socket) => {
    logger.info(`New WebSocket client connected: ${socket.id}`);

    const routes = wsRoutes;

    socket.on("message", async (message: any) => {
      try {
        if (message.jsonrpc !== "2.0" || !message.method)
          return sendError(socket, -32600, "Invalid Request", message.id);

        const request: JsonRpcRequest = message;
        const handler = routes[request.method];

        if (!handler)
          return sendError(socket, -32601, "Method not found", request.id);

        await handler(io, socket)(request);
      } catch (error: any) {
        logger.error(
          `WebSocket message handling error: ${error.message}`,
          error,
        );
        if (message && typeof message.id === "number") {
          sendError(
            socket,
            -32000,
            error.message || "Server error",
            message.id,
          );
        } else {
          console.error(
            "Error processing WebSocket message without ID:",
            message,
            error,
          );
        }
      }
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO server initialized and attached to HTTP server.");
}
