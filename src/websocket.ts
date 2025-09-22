import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Logger } from "winston";
import eventEmitter from "./event-emitter";
import {
  JsonRpcRequest,
  sendError,
  sendLeagueNotification,
} from "./services/websocket.service";
import { getTiers as getTiersRequest } from "./ws-functions/league";
import {
  subscribeLeague,
  unsubscribeLeague,
} from "./ws-functions/league-subscription";

export type SocketListener = (request: JsonRpcRequest) => void;
export type WSRoute = (io: Server, socket: Socket) => SocketListener;

export function startWebSocket(logger: Logger, server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:4200", "https://pokemondraftzone.com"],
      methods: ["GET", "POST"],
    },
    path: "/battlezone/",
  });

  eventEmitter.on(
    "draft.added",
    (data: {
      leagueId: string;
      pick: {
        division: string;
        pokemon: { id: string; name: string; tier: string };
        team: { name: string; id: string };
      };
      canDraftTeams: string[];
    }) => {
      sendLeagueNotification(io, data.leagueId, "league.draft.added", {
        pick: data.pick,
        canDraftTeams: data.canDraftTeams,
      });
    }
  );

  eventEmitter.on(
    "draft.counter",
    (data: {
      leagueId: string;
      division: string;
      currentPick: { round: number; position: number; skipTime?: Date };
      nextTeam: string;
      canDraftTeams: string[];
    }) => {
      sendLeagueNotification(io, data.leagueId, "league.draft.counter", {
        division: data.division,
        currentPick: data.currentPick,
        nextTeam: data.nextTeam,
        canDraftTeams: data.canDraftTeams,
      });
    }
  );

  eventEmitter.on(
    "draft.status",
    (data: {
      leagueId: string;
      division: string;
      status: string;
      currentPick: { round: number; position: number; skipTime?: Date };
    }) => {
      sendLeagueNotification(io, data.leagueId, "league.draft.status", {
        division: data.division,
        status: data.status,
        currentPick: data.currentPick,
      });
    }
  );
  eventEmitter.on(
    "league.draft.skip",
    (data: { leagueId: string; division: string; teamName: string }) => {
      sendLeagueNotification(io, data.leagueId, "league.draft.skip", {
        division: data.division,
        teamName: data.teamName,
      });
    }
  );

  io.on("connection", (socket) => {
    logger.info(`New WebSocket client connected: ${socket.id}`);

    const routes: { [key: string]: WSRoute } = {
      getTiers: getTiersRequest,
      "league.subscribe": subscribeLeague,
      "league.unsubscribe": unsubscribeLeague,
    };

    socket.on("message", async (message: any) => {
      try {
        if (message.jsonrpc !== "2.0" || !message.method) {
          return sendError(socket, -32600, "Invalid Request", message.id);
        }

        const request: JsonRpcRequest = message;
        const handler = routes[request.method];

        if (!handler) {
          return sendError(socket, -32601, "Method not found", request.id);
        }

        await handler(io, socket)(request);
      } catch (error: any) {
        logger.error(
          `WebSocket message handling error: ${error.message}`,
          error
        );
        if (message && typeof message.id === "number") {
          sendError(
            socket,
            -32000,
            error.message || "Server error",
            message.id
          );
        } else {
          console.error(
            "Error processing WebSocket message without ID:",
            message,
            error
          );
        }
      }
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.IO server initialized and attached to HTTP server.");
}
