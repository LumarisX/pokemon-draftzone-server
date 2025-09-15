import { Server, Socket } from "socket.io";
import { WSRoute } from "../websocket";
import { getTierListTemplate } from "../services/league-services/league-service";
import { sendResponse } from "../services/websocket.service";

export const getTiers: WSRoute =
  (io: Server, socket: Socket) => async (request: { id: number }) => {
    const tiers = await getTierListTemplate();
    sendResponse(socket, tiers, request.id);
  };
