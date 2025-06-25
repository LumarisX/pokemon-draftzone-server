import { Server, Socket } from "socket.io";
import { logger } from "../app";

export const joinRoom = (io: Server, socket: Socket) => (leagueId: string) => {
  socket.join(leagueId);
  logger.info(`Socket ${socket.id} joined room: ${leagueId}`);
};
export const sendMessage = (io: Server, socket: Socket) => (data: any) => {
  logger.info(`Message received via WebSocket from ${socket.id}:`, data);
  io.to(data.leagueId).emit("newMessage", data);
};
