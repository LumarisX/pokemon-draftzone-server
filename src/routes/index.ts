import { Handler, Request, RequestParamHandler, Response } from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { EventEmitter } from "stream";
import WebSocket from "ws";
import { config } from "../config";
import { logger } from "../app";

export type Route = {
  middleware?: Handler[];
  subpaths: {
    [subpath: string]: {
      get?: (req: Request, res: Response) => any;
      delete?: (req: Request, res: Response) => any;
      post?: (req: Request, res: Response) => any;
      patch?: (req: Request, res: Response) => any;
      ws?: (
        socket: WebSocket,
        message: string,
        emitter: EventEmitter,
        data?: any
      ) => any;
      middleware?: Handler[];
    };
  };
  ws?: {
    onConnect?: () => { emitter: EventEmitter; data?: any };
  };
  params?: {
    [value: string]: RequestParamHandler;
  };
};

export const jwtCheck = auth({
  audience: config.AUTH0_AUDIENCE,
  issuerBaseURL: config.AUTH0_ISSUER,
  tokenSigningAlg: "RS256",
});

export function sendError(
  res: Response,
  status: number,
  error: Error,
  code: string
) {
  logger.error(error);
  return res.status(status).json({ message: error.message, code });
}
