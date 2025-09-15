import { Server, Socket } from "socket.io";
import { logger } from "../app";

export const joinRoom =
  (io: Server, socket: Socket) => (data: { roomId: string; user: string }) => {
    socket.join(data.roomId);
    logger.info(`${data.user} joined room: ${data.roomId}`);
    io.to(data.roomId).emit("userJoinedRoom", {
      id: socket.id,
      name: data.user,
    });
  };

export const sendMessage =
  (io: Server, socket: Socket) =>
  (data: { roomId: string; text: string; user: string; timestamp: Date }) => {
    logger.info(`Message received via WebSocket from ${socket.id}:`, data.text);
    io.to(data.roomId).emit("newMessage", data);
  };
