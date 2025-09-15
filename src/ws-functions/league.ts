import { Server, Socket } from "socket.io";
import { WSRoute } from "../websocket";
import { getTierListTemplate } from "../services/league-services/league-service";

export const getTiers: WSRoute =
  (io: Server, socket: Socket) => async (request: { id: number }) => {
    const tiers = await getTierListTemplate();
    socket.emit("message", { id: request.id, result: tiers });
  };
