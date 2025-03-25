import {
  Handler,
  NextFunction,
  Request,
  RequestParamHandler,
  Response,
} from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { EventEmitter } from "stream";
import WebSocket from "ws";
import { config } from "../config";

export type Route = {
  middleware?: Handler[];
  subpaths: {
    [subpath: string]: {
      pathId?: string; //eventually make this required for error tracking
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

export type SubRequest = Request & {
  sub?: string;
};

export function getSub(req: SubRequest, res: Response, next: NextFunction) {
  try {
    if (req.headers && req.headers.authorization) {
      let jwt = req.headers.authorization.split(" ")[1];
      req.sub = JSON.parse(atob(jwt.split(".")[1])).sub;
    }
    next();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
}

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
  console.error(error);
  return res.status(status).json({ message: error.message, code });
}
