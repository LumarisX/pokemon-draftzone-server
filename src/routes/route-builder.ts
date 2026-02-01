import { Request, RequestParamHandler, Response } from "express";
import { sendError } from ".";
import { ErrorCodes } from "../errors/error-codes";
import { isPDZError, PDZError } from "../errors/pdz-error";
import { logger } from "../app";

type HttpMethod = "get" | "post" | "patch" | "delete";

type Handler<T = any> = (
  req: Request,
  res: Response,
  ctx: T,
) => Promise<any> | any;

type ParamProcessor<T extends Record<string, any> = Record<string, any>> = (
  req: Request,
  res: Response,
  value: string,
  ctx: any,
) => Promise<T> | T;

type PathConfig<T = any> = {
  [method in HttpMethod]?: Handler<T>;
};

type RouteConfig = {
  paths: {
    [path: string]: PathConfig;
  };
  params?: {
    [paramName: string]: ParamProcessor;
  };
};

export class Route {
  private config: RouteConfig;

  constructor(config: RouteConfig) {
    this.config = config;
  }

  private wrapHandler(
    handler: Handler,
    paramProcessors?: { [key: string]: ParamProcessor },
  ) {
    return async (req: Request, res: Response) => {
      try {
        let ctx: any = {};
        if (paramProcessors && req.params) {
          for (const [paramName, processor] of Object.entries(
            paramProcessors,
          )) {
            const value = req.params[paramName];

            if (value !== undefined) {
              if (value === null || value === "") {
                throw new PDZError(ErrorCodes.PARAMS.REQUIRED, { paramName });
              }
              const result = await processor(req, res, value, ctx);
              ctx = { ...ctx, ...result };
            }
          }
        }
        await handler(req, res, ctx);
      } catch (error) {
        if (isPDZError(error)) {
          return res.status(error.status).json(error.toJSON());
        }
        logger.error("Route error", { error, path: req.path });
        return res.status(500).json({
          error: {
            code: "ROUTE-ERROR",
            message: (error as Error).message,
          },
        });
      }
    };
  }

  getExpressHandlers() {
    const handlers: {
      [path: string]: {
        [method in HttpMethod]?: (req: Request, res: Response) => void;
      };
    } = {};

    for (const [path, pathConfig] of Object.entries(this.config.paths)) {
      handlers[path] = {};
      for (const method of ["get", "post", "patch", "delete"] as HttpMethod[]) {
        if (pathConfig[method]) {
          handlers[path][method] = this.wrapHandler(
            pathConfig[method]!,
            this.config.params,
          );
        }
      }
    }

    return handlers;
  }

  getParams(): { [key: string]: RequestParamHandler } | undefined {
    if (!this.config.params) return undefined;

    const params: { [key: string]: RequestParamHandler } = {};

    for (const paramName in this.config.params) {
      params[paramName] = async (req, res, next, value) => {
        try {
          const result = await this.config.params![paramName](
            req,
            res,
            value,
            res.locals,
          );
          res.locals = { ...res.locals, ...result };
          next();
        } catch (error) {
          if (isPDZError(error)) {
            return res.status(error.status).json(error.toJSON());
          }
          logger.error("Param error", { error, paramName });
          return res.status(500).json({
            error: {
              code: "PARAM-ERROR",
              message: (error as Error).message,
            },
          });
        }
      };
    }

    return params;
  }
}
