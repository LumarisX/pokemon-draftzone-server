import { Server, Socket } from "socket.io";
import { WSRoute } from "../websocket";

export const getTiers: WSRoute =
  (io: Server, socket: Socket) => async (request: { id: number }) => {
    // const tiers = await getTierList();
    // sendResponse(socket, tiers, request.id);
  };
