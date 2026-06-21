import { Server, Socket } from "socket.io";
import eventEmitter from "../event-emitter";
import {
  JsonRpcRequest,
  sendError,
  sendLeagueNotification,
  sendResponse,
  subscribeToLeague,
  unsubscribeFromLeague,
} from "../services/websocket.service";
import { WSRoute, WSRouteGroup } from ".";

// Shape of the per-pick display array draft-service.ts actually builds and
// emits on `team.draft` (see draftPokemon's `draftPicks` local) — derived
// from PopulatedTeam.pickLog, not a 1:1 serialization of PickLogEntity.
type TeamDraftPick = {
  id: string;
  name: string;
  tier: string | undefined;
  cost: number;
};

type DraftAddedPayload = {
  tournamentId: string;
  draftId: string;
  pick: {
    pokemon: { id: string; name: string; tier: string };
    team: { name: string; id: string };
  };
  team: {
    id: string;
    name: string;
    draft: TeamDraftPick[];
  };
  canDraftTeams: string[];
};

type DraftCounterPayload = {
  tournamentId: string;
  draftId: string;
  currentPick: { round: number; position: number; skipTime?: Date };
  nextTeam: string;
  canDraftTeams: string[];
};

type DraftStatusPayload = {
  tournamentId: string;
  draftId: string;
  status: string;
  currentPick: { round: number; position: number; skipTime?: Date };
};

type DraftSkipPayload = {
  tournamentId: string;
  draftId: string;
  teamName: string;
};

export const subscribeLeague: WSRoute = (io: Server, socket: Socket) => {
  return (request: JsonRpcRequest) => {
    if (typeof request.params.tournamentKey === "string") {
      subscribeToLeague(socket, request.params.tournamentKey);
      sendResponse(
        socket,
        `Subscribed to league ${request.params.tournamentKey}`,
        request.id,
      );
    } else {
      sendError(socket, -32602, "Invalid params", request.id);
    }
  };
};

export const unsubscribeLeague: WSRoute = (io: Server, socket: Socket) => {
  return (request: JsonRpcRequest) => {
    if (typeof request.params.tournamentKey === "string") {
      unsubscribeFromLeague(socket, request.params.tournamentKey);
      sendResponse(
        socket,
        `Unsubscribed from league ${request.params.tournamentKey}`,
        request.id,
      );
    } else {
      sendError(socket, -32602, "Invalid params", request.id);
    }
  };
};

export const registerLeagueEvents = (io: Server) => {
  eventEmitter.on("draft.added", (data: DraftAddedPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.added", {
      draftId: data.draftId,
      pick: data.pick,
      canDraftTeams: data.canDraftTeams,
      team: data.team,
    });
  });

  eventEmitter.on("draft.counter", (data: DraftCounterPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.counter", {
      draftId: data.draftId,
      currentPick: data.currentPick,
      nextTeam: data.nextTeam,
      canDraftTeams: data.canDraftTeams,
    });
  });

  eventEmitter.on("draft.status", (data: DraftStatusPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.status", {
      draftId: data.draftId,
      status: data.status,
      currentPick: data.currentPick,
    });
  });

  eventEmitter.on("league.draft.skip", (data: DraftSkipPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.skip", {
      draftId: data.draftId,
      teamName: data.teamName,
    });
  });
};

export const leagueWsGroup: WSRouteGroup = {
  namespace: "league",
  routes: {
    subscribe: subscribeLeague,
    unsubscribe: unsubscribeLeague,
  },
  registerEvents: registerLeagueEvents,
};
