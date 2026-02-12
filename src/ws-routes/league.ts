import { Server, Socket } from "socket.io";
import eventEmitter from "../event-emitter";
import { TeamDraft } from "../models/league/team.model";
import {
  JsonRpcRequest,
  sendError,
  sendLeagueNotification,
  sendResponse,
  subscribeToLeague,
  unsubscribeFromLeague,
} from "../services/websocket.service";
import { WSRoute, WSRouteGroup } from ".";

type DraftAddedPayload = {
  tournamentId: string;
  divisionId: string;
  pick: {
    pokemon: { id: string; name: string; tier: string };
    team: { name: string; id: string };
  };
  team: {
    id: string;
    name: string;
    draft: TeamDraft[];
  };
  canDraftTeams: string[];
};

type DraftCounterPayload = {
  tournamentId: string;
  divisionId: string;
  currentPick: { round: number; position: number; skipTime?: Date };
  nextTeam: string;
  canDraftTeams: string[];
};

type DraftStatusPayload = {
  tournamentId: string;
  divisionId: string;
  status: string;
  currentPick: { round: number; position: number; skipTime?: Date };
};

type DraftSkipPayload = {
  tournamentId: string;
  divisionId: string;
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
      divisionId: data.divisionId,
      pick: data.pick,
      canDraftTeams: data.canDraftTeams,
      team: data.team,
    });
  });

  eventEmitter.on("draft.counter", (data: DraftCounterPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.counter", {
      divisionId: data.divisionId,
      currentPick: data.currentPick,
      nextTeam: data.nextTeam,
      canDraftTeams: data.canDraftTeams,
    });
  });

  eventEmitter.on("draft.status", (data: DraftStatusPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.status", {
      divisionId: data.divisionId,
      status: data.status,
      currentPick: data.currentPick,
    });
  });

  eventEmitter.on("league.draft.skip", (data: DraftSkipPayload) => {
    sendLeagueNotification(io, data.tournamentId, "league.draft.skip", {
      divisionId: data.divisionId,
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
