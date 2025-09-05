import { Server, Socket } from "socket.io";
import { logger } from "../app";

export const userJoinedRoom =
  (io: Server, socket: Socket) => (data: { roomId: string; user: string }) => {
    socket.join(data.roomId);
    logger.info(`${data.user} joined room: ${data.roomId}`);
    io.to(data.roomId).emit("userJoinedRoom", socket.id);
  };
