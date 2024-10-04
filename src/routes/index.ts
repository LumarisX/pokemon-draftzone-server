import {
  Handler,
  NextFunction,
  Request,
  RequestParamHandler,
  Response,
} from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { ObjectId } from "mongoose";
import WebSocket from "ws";

export type Route = {
  middleware?: Handler[];
  subpaths: {
    [subpath: string]: {
      get?: (req: Request, res: Response) => any;
      delete?: (req: Request, res: Response) => any;
      post?: (req: Request, res: Response) => any;
      patch?: (req: Request, res: Response) => any;
      ws?: (socket: WebSocket, message: string) => any;
      middleware?: Handler[];
    };
  };
  params?: {
    [value: string]: RequestParamHandler;
  };
};

export type SubRequest = Request & {
  sub?: ObjectId;
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
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER,
  tokenSigningAlg: "RS256",
});
