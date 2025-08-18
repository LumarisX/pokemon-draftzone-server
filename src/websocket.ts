import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Logger } from "winston";
import { joinRoom, sendMessage } from "./ws-functions/chat";

export type SocketListener = (...args: any[]) => void;
export type WSRoute = (io: Server, socket: Socket) => SocketListener;

export function startWebSocket(logger: Logger, server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:4200",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`New WebSocket client connected: ${socket.id}`);

    const routes: { [key: string]: WSRoute } = {
      joinRoom,
      sendMessage,
    };

    Object.entries(routes).forEach(([routeName, genFn]) => {
      socket.on(routeName, genFn(io, socket));
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO server initialized and attached to HTTP server.");
}
