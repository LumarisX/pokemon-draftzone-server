import { Server, Socket } from "socket.io";
import { leagueWsGroup } from "./league";
import { teambuilderWsGroup } from "./teambuilder";
import { JsonRpcRequest } from "../services/websocket.service";

export type SocketListener = (request: JsonRpcRequest) => void | Promise<void>;
export type WSRoute = (io: Server, socket: Socket) => SocketListener;
export type WSSubRouteMap = Record<string, WSRoute>;
export type WSRouteMap = Record<string, WSRoute>;

export type WSRouteGroup = {
  namespace: string;
  routes: WSSubRouteMap;
  registerEvents?: (io: Server) => void;
};

export const wsRouteGroups: WSRouteGroup[] = [
  leagueWsGroup,
  teambuilderWsGroup,
];

export const registerWsEvents = (io: Server) => {
  for (const group of wsRouteGroups) {
    group.registerEvents?.(io);
  }
};

export const wsRoutes: WSRouteMap = wsRouteGroups.reduce((routeMap, group) => {
  for (const [subRoute, handler] of Object.entries(group.routes)) {
    routeMap[`${group.namespace}.${subRoute}`] = handler;
  }

  return routeMap;
}, {} as WSRouteMap);
