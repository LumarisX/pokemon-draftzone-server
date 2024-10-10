import { EventEmitter } from "events";
import { Route } from ".";
import * as State from "../../../dmg/src/state";
import { getRuleset, RulesetId } from "../data/rulesets";
import {
  JsonRpcRequest,
  sendError,
  sendResponse,
} from "../services/websocket.service";

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
      rpcEmitter.on("add", (socket, request, array: any[]) => {
        const { ruleset, format, id } = request.params;
        const gen = getRuleset(ruleset as RulesetId).gen;
        array.push(State.State.createPokemon(gen, id, { nature: "Serious" }));
        const team = array.map((mon) => ({
          name: mon.species.name,
          evs: mon.evs,
          ivs: mon.ivs,
          ability: gen.abilities.get(mon.ability ?? "")?.name ?? "",
          level: mon.level,
          nature: mon.nature ?? "Serious",
          item: gen.items.get(mon.item ?? "")?.name ?? "None",
          teraType: mon.teraType,
        }));
        sendResponse(socket, { team }, request.id);
      });

      rpcEmitter.on("unknownMethod", (socket, request) => {
        sendError(socket, -32601, "Method not found", request.id);
      });

      return { emitter: rpcEmitter, data: [] };
    },
  },
};
