import { Server, Socket } from "socket.io";
import { getTiers as getTiersData } from "../data/pdbl";
import { WSRoute } from "../websocket";

export const getTiers: WSRoute = (io: Server, socket: Socket) => (request: { id: number }) => {
  const tiers = getTiersData();
  socket.emit('message', { id: request.id, result: tiers });
};
