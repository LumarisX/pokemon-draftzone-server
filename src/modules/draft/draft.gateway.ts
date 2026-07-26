import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {
  DraftAddedEvent,
  DraftCompletedEvent,
  DraftCounterEvent,
  DraftSkipEvent,
  DraftStatusEvent,
} from "./draft-events.service";

const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://pokemondraftzone.com",
  "https://dqptrox2bn9qw.cloudfront.net",
];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Rooms are keyed by tournamentId (see league.subscribe/unsubscribe below),
 * so a single "watch this tournament" subscription covers every draft,
 * matchup, etc. under it. Clients filter by draftId themselves.
 */
@WebSocketGateway({
  path: "/ws/",
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class DraftGateway {
  private readonly logger = new Logger(DraftGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage("message")
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: JsonRpcRequest,
  ): void {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: request.id };
    const tournamentKey = request.params?.["tournamentKey"];

    switch (request.method) {
      case "league.subscribe":
        if (typeof tournamentKey === "string" && tournamentKey) {
          client.join(tournamentKey);
          response.result = { subscribed: tournamentKey };
        } else {
          response.error = {
            code: -32602,
            message: "tournamentKey is required",
          };
        }
        break;
      case "league.unsubscribe":
        if (typeof tournamentKey === "string" && tournamentKey) {
          client.leave(tournamentKey);
          response.result = { unsubscribed: tournamentKey };
        } else {
          response.error = {
            code: -32602,
            message: "tournamentKey is required",
          };
        }
        break;
      default:
        response.error = {
          code: -32601,
          message: `Unknown method: ${request.method}`,
        };
    }

    client.emit("message", response);
  }

  private broadcast(tournamentId: string, event: string, data: unknown): void {
    if (!tournamentId) {
      this.logger.warn(`Dropping ${event} broadcast with no tournamentId`);
      return;
    }
    this.server.to(tournamentId).emit("message", { event, data });
  }

  @OnEvent("league.draft.added")
  onDraftAdded(payload: DraftAddedEvent): void {
    this.broadcast(payload.tournamentId, "league.draft.added", payload);
  }

  @OnEvent("league.draft.counter")
  onDraftCounter(payload: DraftCounterEvent): void {
    this.broadcast(payload.tournamentId, "league.draft.counter", payload);
  }

  @OnEvent("league.draft.status")
  onDraftStatus(payload: DraftStatusEvent): void {
    this.broadcast(payload.tournamentId, "league.draft.status", payload);
  }

  @OnEvent("league.draft.skip")
  onDraftSkip(payload: DraftSkipEvent): void {
    this.broadcast(payload.tournamentId, "league.draft.skip", payload);
  }

  @OnEvent("league.draft.completed")
  onDraftCompleted(payload: DraftCompletedEvent): void {
    this.broadcast(payload.tournamentId, "league.draft.completed", payload);
  }
}
