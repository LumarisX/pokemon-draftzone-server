import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Logger } from "winston";
import eventEmitter from "./event-emitter";
import { getTierListTemplate } from "./services/league-services/league-service";
import { JsonRpcRequest, sendError } from "./services/websocket.service";
import { getTiers as getTiersRequest } from "./ws-functions/league";

export type SocketListener = (request: JsonRpcRequest) => void;
export type WSRoute = (io: Server, socket: Socket) => SocketListener;

export function startWebSocket(logger: Logger, server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:4200", "https://pokemondraftzone.com"],
      methods: ["GET", "POST"],
    },
    path: "/battlezone/",
  });

  eventEmitter.on("tiersUpdated", async () => {
    const tiers = await getTierListTemplate();
    io.emit("message", { event: "tiersUpdated", data: tiers });
  });

  io.on("connection", (socket) => {
    logger.info(`New WebSocket client connected: ${socket.id}`);

    const routes: { [key: string]: WSRoute } = {
      // joinRoom,
      // sendMessage,
      getTiers: getTiersRequest,
    };

    socket.on("message", async (message: any) => {
      try {
        if (message.jsonrpc !== "2.0" || !message.method) {
          return sendError(socket, -32600, "Invalid Request", message.id);
        }

        const request: JsonRpcRequest = message;
        const handler = routes[request.method];

        if (!handler) {
          return sendError(socket, -32601, "Method not found", request.id);
        }

        await handler(io, socket)(request);
      } catch (error: any) {
        logger.error(
          `WebSocket message handling error: ${error.message}`,
          error
        );
        if (message && typeof message.id === "number") {
          sendError(
            socket,
            -32000,
            error.message || "Server error",
            message.id
          );
        } else {
          console.error(
            "Error processing WebSocket message without ID:",
            message,
            error
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
