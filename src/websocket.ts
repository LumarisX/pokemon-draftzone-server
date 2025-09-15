import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Logger } from "winston";
import { joinRoom, sendMessage } from "./ws-functions/rooms";
import { getTiers as getTiersRequest } from "./ws-functions/league";
import eventEmitter from "./event-emitter";
import { getTierListTemplate } from "./services/league-services/league-service";

export type SocketListener = (...args: any[]) => void;
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
      joinRoom,
      sendMessage,
      getTiers: getTiersRequest,
    };

    socket.on(
      "message",
      (message: { event: string; id: number; [key: string]: any }) => {
        if (message && message.event && routes[message.event]) {
          routes[message.event](io, socket)(message);
        }
      }
    );

    Object.entries(routes).forEach(([routeName, genFn]) => {
      socket.on(routeName, genFn(io, socket));
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO server initialized and attached to HTTP server.");
}
