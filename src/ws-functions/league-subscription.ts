import { Server, Socket } from "socket.io";
import {
  JsonRpcRequest,
  sendError,
  sendResponse,
  subscribeToLeague,
  unsubscribeFromLeague,
} from "../services/websocket.service";
import { WSRoute } from "../websocket";

export const subscribeLeague: WSRoute = (io: Server, socket: Socket) => {
  return (request: JsonRpcRequest) => {
    if (typeof request.params.leagueId === "string") {
      subscribeToLeague(socket, request.params.leagueId);
      sendResponse(
        socket,
        `Subscribed to league ${request.params.leagueId}`,
        request.id
      );
    } else {
      sendError(socket, -32602, "Invalid params", request.id);
    }
  };
};

export const unsubscribeLeague: WSRoute = (io: Server, socket: Socket) => {
  return (request: JsonRpcRequest) => {
    if (typeof request.params.leagueId === "string") {
      unsubscribeFromLeague(socket, request.params.leagueId);
      sendResponse(
        socket,
        `Unsubscribed from league ${request.params.leagueId}`,
        request.id
      );
    } else {
      sendError(socket, -32602, "Invalid params", request.id);
    }
  };
};
