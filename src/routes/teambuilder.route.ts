import { EventEmitter } from "events";
import * as State from "../../../dmg/src/state";
import { getRuleset, RulesetId } from "../data/rulesets";
import { Route } from ".";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params: any;
  id: number;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: number;
};

const rpcEmitter = new EventEmitter();

// Function to send a JSON-RPC response
const sendResponse = (socket: any, result: any, id: number) => {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    result,
    id,
  };
  socket.send(JSON.stringify(response));
};

// Function to send an error response
const sendError = (
  socket: any,
  code: number,
  message: string,
  id: number | undefined
) => {
  const errorResponse: JsonRpcResponse = {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id,
  };
  socket.send(JSON.stringify(errorResponse));
};

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

export const TeambuilderRoutes: Route = {
  subpaths: {
    "/": {
      ws: (socket, message, array: State.State.Pokemon[]) => {
        let request: JsonRpcRequest;
        console.log(message);
        try {
          request = JSON.parse(message);
          if (request.jsonrpc !== "2.0" || typeof request.id !== "number") {
            throw new Error("Invalid JSON-RPC request");
          }
        } catch (error) {
          sendError(socket, -32700, "Parse error", undefined); // undefined id for parse errors
          return;
        }
        console.log(rpcEmitter.listenerCount(request.method));
        if (rpcEmitter.listenerCount(request.method) > 0) {
          rpcEmitter.emit(request.method, socket, request, array);
        } else {
          rpcEmitter.emit("unknownMethod", socket, request);
        }
      },
    },
  },
  ws: {
    onConnect: () => {
      return [];
    },
  },
};
