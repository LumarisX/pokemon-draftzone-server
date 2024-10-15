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
      // Add event listeners for various methods
      rpcEmitter.on("add", (socket, request, team: Teambuilder.Pokemon[]) => {
        const { rulesetID, formatID, id } = request.params;
        const ruleset = getRuleset(rulesetID as RulesetId);
        team.push(
          new Teambuilder.Pokemon(
            new DraftSpecies(ruleset.gen.dex.species.get(id), {}, ruleset)
          )
        );
        sendResponse(
          socket,
          {
            team: team.map((mon) => ({
              name: mon.specie.name,
              evs: mon.evs,
              ivs: mon.ivs,
              ability: mon.ability.name,
              level: mon.level,
              nature: mon.nature.name,
              item: mon.item?.name,
              teraType: mon.teraType,
              stats: mon.stats,
            })),
          },
          request.id
        );
      });

      rpcEmitter.on(
        "update",
        (socket, request, team: Teambuilder.Pokemon[]) => {
          const { index, data } = request.params;

          if (team[index]) {
            const mutableData = { ...data };
            delete mutableData.stats;
            console.log(mutableData);
            team[index] = Object.assign(
              team[index],
              mutableData as Partial<Teambuilder.Pokemon>
            );
          }
          sendResponse(
            socket,
            {
              pokemon: {
                name: team[index].specie.name,
                evs: team[index].evs,
                ivs: team[index].ivs,
                ability: team[index].ability.name,
                level: team[index].level,
                nature: team[index].nature.name,
                item: team[index].item?.name,
                teraType: team[index].teraType,
                stats: team[index].stats,
              },
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
