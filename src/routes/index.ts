import {
  Handler,
  NextFunction,
  Request,
  RequestParamHandler,
  Response,
} from "express";
import { EventEmitter } from "stream";
import WebSocket from "ws";
import { logger } from "../app";

export type Route = {
  middleware?: Handler[];
  subpaths: {
    [subpath: string]: {
      get?: (req: Request, res: Response, next: NextFunction) => any;
      delete?: (req: Request, res: Response, next: NextFunction) => any;
      post?: (req: Request, res: Response, next: NextFunction) => any;
      patch?: (req: Request, res: Response, next: NextFunction) => any;
      ws?: (
        socket: WebSocket,
        message: string,
        emitter: EventEmitter,
        data?: any,
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

export function sendError(
  res: Response,
  status: number,
  error: Error,
  code: string,
) {
  logger.error(error);
  return res.status(status).json({ message: error.message, code });
}
