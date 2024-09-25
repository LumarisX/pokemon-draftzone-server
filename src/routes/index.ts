import { Handler, Request, RequestParamHandler, Response } from "express";

export type Route = {
  path: string;
  middleware?: Handler[];
  subpaths: {
    [subpath: string]: {
      get?: (req: Request, res: Response) => any;
      delete?: (req: Request, res: Response) => any;
      post?: (req: Request, res: Response) => any;
      patch?: (req: Request, res: Response) => any;
      ws?: () => any;
    };
  };
  params?: {
    [value: string]: RequestParamHandler;
  };
};
