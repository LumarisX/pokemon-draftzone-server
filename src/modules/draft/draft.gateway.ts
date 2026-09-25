import { WsAuthService } from "@modules/auth/ws-auth.service";
import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { isActiveCoach } from "@modules/tournament/membership";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { can, isStaff } from "@modules/tournament/tournament-policy";
import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {
  DraftAddedEvent,
  DraftCompletedEvent,
  DraftCounterEvent,
  DraftEventAudience,
  DraftPickUpdatedEvent,
  DraftSkipEvent,
  DraftStatusEvent,
} from "./draft-events.service";

const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://pokemondraftzone.com",
  "https://dqptrox2bn9qw.cloudfront.net",
];

const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

type TournamentAccess = {
  member: boolean;
  seesAllPicks: boolean;
  teamIds: Set<string>;
};

type ViewerState = {
  sub: string | null;
  ready: Promise<void>;
  access: Map<string, TournamentAccess>;
};

type EventData = Record<string, unknown>;

type Redactor = (data: EventData) => EventData;

const NO_ACCESS: TournamentAccess = {
  member: false,
  seesAllPicks: false,
  teamIds: new Set(),
};

const hidePick: Redactor = (data) => {
  const pick = data["pick"] as EventData | undefined;
  const team = data["team"] as EventData | undefined;
  return {
    ...data,
    ...(pick ? { pick: { team: pick["team"], draft: pick["draft"] } } : {}),
    ...(team ? { team: { id: team["id"], name: team["name"], draft: [] } } : {}),
    pokemon: undefined,
    previous: undefined,
  };
};

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

@WebSocketGateway({
  path: "/ws/",
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class DraftGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DraftGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  handleConnection(client: Socket): void {
    const viewer: ViewerState = {
      sub: null,
      ready: Promise.resolve(),
      access: new Map(),
    };
    viewer.ready = this.wsAuth
      .subjectOf(client.handshake.auth?.["token"])
      .then((sub) => {
        viewer.sub = sub;
      });
    client.data.viewer = viewer;
  }

  @SubscribeMessage("message")
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: JsonRpcRequest,
  ): Promise<void> {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id: request?.id };
    try {
      response.result = await this.dispatch(client, request);
    } catch (error) {
      response.error =
        error instanceof RpcError
          ? { code: error.code, message: error.message }
          : { code: -32603, message: "Internal error" };
    }
    client.emit("message", response);
  }

  private async dispatch(client: Socket, request: JsonRpcRequest) {
    const tournamentSlug = request?.params?.["tournamentSlug"];

    switch (request?.method) {
      case "league.subscribe": {
        const slug = this.requireSlug(tournamentSlug);
        const viewer = this.viewerOf(client);
        await viewer.ready;

        const tournament = await this.tournamentRepo.findBySlugAnyLeague(slug);
        if (!tournament) throw new RpcError(-32602, "Tournament not found");

        viewer.access.set(
          tournament.slug,
          await this.accessFor(tournament, viewer.sub),
        );
        await client.join(tournament.slug);
        return { subscribed: tournament.slug };
      }
      case "league.unsubscribe": {
        const slug = this.requireSlug(tournamentSlug);
        this.viewerOf(client).access.delete(slug);
        await client.leave(slug);
        return { unsubscribed: slug };
      }
      default:
        throw new RpcError(-32601, `Unknown method: ${request?.method}`);
    }
  }

  private requireSlug(value: unknown): string {
    if (typeof value !== "string" || !SLUG_PATTERN.test(value))
      throw new RpcError(-32602, "A valid tournamentSlug is required");
    return value;
  }

  private viewerOf(client: { data: { viewer?: ViewerState } }): ViewerState {
    if (!client.data.viewer)
      client.data.viewer = {
        sub: null,
        ready: Promise.resolve(),
        access: new Map(),
      };
    return client.data.viewer;
  }

  private async accessFor(
    tournament: HostedTournament,
    sub: string | null,
  ): Promise<TournamentAccess> {
    if (!sub) return NO_ACCESS;
    const coaches = (await this.coachRepo.findByAuth0Id(sub)).filter(
      isActiveCoach,
    );
    const teams = coaches.length
      ? await this.teamRepo.findManyByIds(coaches.map((coach) => coach.teamId))
      : [];
    const teamIds = new Set(
      teams
        .filter(
          (team) =>
            team.tournamentId.toString() === tournament.id &&
            team.status === "approved",
        )
        .map((team) => team._id.toString()),
    );
    return {
      member: isStaff(tournament, sub) || teamIds.size > 0,
      seesAllPicks: can(tournament, sub, "manageDrafts"),
      teamIds,
    };
  }

  private async broadcast(
    event: string,
    payload: {
      tournamentSlug: string;
      audience: DraftEventAudience;
    },
    redact?: Redactor,
  ): Promise<void> {
    const { audience, ...data } = payload;
    const room = payload.tournamentSlug;
    if (!room) {
      this.logger.warn(`Dropping ${event} broadcast with no tournamentSlug`);
      return;
    }

    if (audience.draftPublic && !audience.blindTeamId) {
      this.server.to(room).emit("message", { event, data });
      return;
    }

    const sockets = await this.server.in(room).fetchSockets();
    for (const socket of sockets) {
      const access = this.viewerOf(socket).access.get(room) ?? NO_ACCESS;
      if (!audience.draftPublic && !access.member) continue;

      const hidden =
        !!audience.blindTeamId &&
        !access.seesAllPicks &&
        !access.teamIds.has(audience.blindTeamId);
      socket.emit("message", {
        event,
        data: hidden && redact ? redact(data) : data,
      });
    }
  }

  @OnEvent("league.draft.added")
  onDraftAdded(payload: DraftAddedEvent) {
    return this.broadcast("league.draft.added", payload, hidePick);
  }

  @OnEvent("league.draft.counter")
  onDraftCounter(payload: DraftCounterEvent) {
    return this.broadcast("league.draft.counter", payload);
  }

  @OnEvent("league.draft.updated")
  onDraftPickUpdated(payload: DraftPickUpdatedEvent) {
    return this.broadcast("league.draft.updated", payload, hidePick);
  }

  @OnEvent("league.draft.status")
  onDraftStatus(payload: DraftStatusEvent) {
    return this.broadcast("league.draft.status", payload);
  }

  @OnEvent("league.draft.skip")
  onDraftSkip(payload: DraftSkipEvent) {
    return this.broadcast("league.draft.skip", payload);
  }

  @OnEvent("league.draft.completed")
  onDraftCompleted(payload: DraftCompletedEvent) {
    return this.broadcast("league.draft.completed", payload);
  }
}
