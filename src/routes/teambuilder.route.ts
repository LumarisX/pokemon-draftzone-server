import { EventEmitter } from "events";
import { Route } from ".";
import * as State from "../../../dmg/src/state";
import { getRuleset, RulesetId } from "../data/rulesets";
import {
  JsonRpcRequest,
  sendError,
  sendResponse,
} from "../services/websocket.service";
import { Teambuilder } from "../classes/teambuilder";
import { DraftSpecies } from "../classes/pokemon";

export const TeambuilderRoutes: Route = {
  subpaths: {
    "/": {
      ws: (socket, message, emitter, array: State.State.Pokemon[]) => {
        let request: JsonRpcRequest;
        try {
          request = JSON.parse(message);
          if (request.jsonrpc !== "2.0" || typeof request.id !== "number") {
            throw new Error("Invalid JSON-RPC request");
          }
        } catch (error) {
          sendError(socket, -32700, "Parse error", undefined);
          return;
        }
        if (emitter!.listenerCount(request.method) > 0) {
          emitter!.emit(request.method, socket, request, array);
        } else {
          emitter!.emit("unknownMethod", socket, request);
        }
      },
    },
  },
  ws: {
    onConnect: () => {
      const rpcEmitter = new EventEmitter();

      rpcEmitter.on(
        "add",
        async (socket, request, team: Teambuilder.Pokemon[]) => {
          const { rulesetID, formatID, id } = request.params;
          const ruleset = getRuleset(rulesetID as RulesetId);
          team.push(
            new Teambuilder.Pokemon(
              new DraftSpecies(ruleset.gen.dex.species.get(id), {}, ruleset)
            )
          );

          const teamData = await Promise.all(
            team.map((mon) => mon.toBuilder())
          );

          sendResponse(
            socket,
            {
              team: teamData,
            },
            request.id
          );
        }
      );

      rpcEmitter.on(
        "update",
        async (socket, request, team: Teambuilder.Pokemon[]) => {
          const {
            index,
            data,
          }: { index: number; data: Partial<Teambuilder.Pokemon> } =
            request.params;
          if (team[index]) {
            console.log(data);
            team[index] = Object.assign(team[index], data);
          }

          const pokemonData = await team[index].toBuilder();

          sendResponse(
            socket,
            {
              pokemon: pokemonData,
              index: index,
            },
            request.id
          );
        }
      );

      rpcEmitter.on("unknownMethod", (socket, request) => {
        sendError(socket, -32601, "Method not found", request.id);
      });

      return { emitter: rpcEmitter, data: [] };
    },
  },
};
