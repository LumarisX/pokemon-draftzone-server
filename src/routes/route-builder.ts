import { Request, RequestHandler, Response, Router } from "express";
import { logger } from "../app";
import { isPDZError } from "../errors/pdz-error";
import { jwtCheck } from "../middleware/jwtcheck";

const HTTP_METHODS = ["get", "post", "patch", "delete"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type ContextBuilder<TParentCtx = any, TReturn = any> = (
  req: Request,
  res: Response,
  parentCtx: TParentCtx,
  paramValue: string,
) => TReturn | Promise<TReturn>;

type ParamValidator = (value: string) => boolean;
type ParamTransformer<T> = (value: string) => T;
type ParamLoader<TParentCtx, TTransformed, TReturn> = (
  req: Request,
  res: Response,
  parentCtx: TParentCtx,
  transformedValue: TTransformed,
) => TReturn | Promise<TReturn>;

type ParamConfig<TParentCtx, TTransformed, TReturn> = {
  validate?: ParamValidator;
  transform?: ParamTransformer<TTransformed>;
  loader: ParamLoader<TParentCtx, TTransformed, TReturn>;
  onValidationError?: (paramName: string, value: string) => Error;
};

type Handler<TCtx = any> = (
  req: Request,
  res: Response,
  ctx: TCtx,
) => Promise<any> | any;

type MethodHandler = { [m in HttpMethod]: Handler };

type RouteNode<TParentCtx = any> = Partial<MethodHandler> & {
  context?: ContextBuilder<TParentCtx, any>;
  authCheck?: boolean;
  middleware?: RequestHandler[];
  paths?: {
    [segment: string]: RouteNode<any>;
  };
};

export class Route {
  private router: Router;

  constructor(config: RouteNode<any>) {
    this.router = Router();
    this.buildRoute(config, this.router, {});
  }

  private async executeAuthCheck(req: Request, res: Response): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      jwtCheck(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private wrapHandler(
    handler: Handler<any>,
    node: RouteNode<any>,
    parentContext: Record<string, any>,
  ) {
    return async (req: Request, res: Response) => {
      try {
        let ctx = parentContext;
        if (node.authCheck) {
          await this.executeAuthCheck(req, res);
          ctx = { ...ctx, sub: req.auth!.payload.sub! };
        }

        if (node.context) {
          const nodeContext = await node.context(req, res, ctx, "");
          ctx = Object.assign(Object.create(null), ctx, nodeContext);
        }

        await handler(req, res, ctx);
      } catch (error) {
        if (isPDZError(error)) {
          return res.status(error.status).json(error.toJSON());
        }
        logger.error("Route error", {
          error,
          errorType: error?.constructor?.name,
          errorMessage: (error as Error)?.message,
          errorStack: (error as Error)?.stack,
          path: req.path,
          method: req.method,
        });

        const errorMessage =
          (error as Error)?.message ||
          (error as any)?.toString() ||
          "An unknown error occurred";

        return res.status(500).json({
          error: {
            code: "ROUTE-ERROR",
            message: errorMessage,
          },
        });
      }
    };
  }

  private buildRoute(
    node: RouteNode<any>,
    router: Router,
    parentContext: Record<string, any>,
  ) {
    if (node.middleware) {
      router.use(...node.middleware);
    }

    for (const method of HTTP_METHODS) {
      if (node[method]) {
        router[method](
          "/",
          this.wrapHandler(node[method]!, node, parentContext),
        );
      }
    }

    if (node.paths) {
      let childContext = parentContext;

      for (const [segment, childNode] of Object.entries(node.paths)) {
        const childRouter = Router();
        this.buildRoute(childNode, childRouter, childContext);
        router.use(`/${segment}`, childRouter);
      }
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

function createValidationWrapper<TBody, TQuery, TCtx>(
  schema: {
    body?: (data: any) => TBody;
    query?: (data: any) => TQuery;
  },
  handler: Handler<TCtx & { validatedBody: TBody; validatedQuery: TQuery }>,
): Handler<TCtx> {
  return async (req: Request, res: Response, ctx: TCtx) => {
    const validatedCtx = { ...ctx } as TCtx & {
      validatedBody: TBody;
      validatedQuery: TQuery;
    };

    if (schema.body) {
      try {
        validatedCtx.validatedBody = schema.body(req.body);
      } catch (error) {
        logger.warn("Body validation failed", { error });
        throw error;
      }
    }

    if (schema.query) {
      try {
        validatedCtx.validatedQuery = schema.query(req.query);
      } catch (error) {
        logger.warn("Query validation failed", { error });
        throw error;
      }
    }

    return handler(req, res, validatedCtx);
  };
}

type ConfigurableBuilder<TCtx> = {
  (configure: (builder: RouteBuilder<TCtx>) => void): Route;
  auth(): ConfigurableBuilder<TCtx & { sub: string }>;
  use(...middleware: RequestHandler[]): ConfigurableBuilder<TCtx>;
};

type HttpMethodBuilderWithValidate<TCtx> = {
  (handler: Handler<TCtx>): void;
  validate<TBody = undefined, TQuery = undefined>(schema: {
    body?: (data: any) => TBody;
    query?: (data: any) => TQuery;
  }): (
    handler: Handler<TCtx & { validatedBody: TBody; validatedQuery: TQuery }>,
  ) => void;
};

type HttpMethodBuilder<TCtx> = {
  (handler: Handler<TCtx>): void;
  auth(): HttpMethodBuilderWithValidate<TCtx & { sub: string }>;
  use(...middleware: RequestHandler[]): HttpMethodBuilderWithValidate<TCtx>;
  validate<TBody = undefined, TQuery = undefined>(schema: {
    body?: (data: any) => TBody;
    query?: (data: any) => TQuery;
  }): (
    handler: Handler<TCtx & { validatedBody: TBody; validatedQuery: TQuery }>,
  ) => void;
};

export class RouteBuilder<TCtx = {}> {
  private node: RouteNode<TCtx> = {};
  private children: Map<string, RouteBuilder<any>> = new Map();

  auth(): ConfigurableBuilder<TCtx & { sub: string }> {
    this.node.authCheck = true;
    return this.makeConfigurable() as ConfigurableBuilder<
      TCtx & { sub: string }
    >;
  }

  use(...middleware: RequestHandler[]): ConfigurableBuilder<TCtx> {
    this.node.middleware = [...(this.node.middleware || []), ...middleware];
    return this.makeConfigurable();
  }

  makeConfigurable(): ConfigurableBuilder<TCtx> {
    const self = this;
    const callable = ((configure: (builder: RouteBuilder<TCtx>) => void) => {
      configure(self);
      return new Route(self.getConfig());
    }) as ConfigurableBuilder<TCtx>;

    callable.auth = () => {
      self.node.authCheck = true;
      return self.makeConfigurable() as ConfigurableBuilder<
        TCtx & { sub: string }
      >;
    };

    callable.use = (...middleware: RequestHandler[]) => {
      self.node.middleware = [...(self.node.middleware || []), ...middleware];
      return self.makeConfigurable();
    };

    return callable;
  }

  path(segment: string): ConfigurableBuilder<TCtx> {
    let childBuilder = this.children.get(segment);
    if (!childBuilder) {
      childBuilder = new RouteBuilder<TCtx>();
      this.children.set(segment, childBuilder);
    }
    return childBuilder.makeConfigurable();
  }

  param<TNewCtx>(
    paramName: string,
    contextBuilder: ContextBuilder<TCtx, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TTransformed = string, TNewCtx = any>(
    paramName: string,
    config: ParamConfig<TCtx, TTransformed, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TTransformed = string, TNewCtx = any>(
    paramName: string,
    contextBuilderOrConfig:
      | ContextBuilder<TCtx, TNewCtx>
      | ParamConfig<TCtx, TTransformed, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx> {
    const paramSegment = `:${paramName}`;
    let childBuilder = this.children.get(paramSegment);
    if (!childBuilder) {
      childBuilder = new RouteBuilder<TCtx & TNewCtx>();

      if (typeof contextBuilderOrConfig === "function") {
        childBuilder.node.context = async (
          req: Request,
          res: Response,
          parentCtx: TCtx,
        ) => {
          const value = req.params[paramName];
          return contextBuilderOrConfig(req, res, parentCtx, value);
        };
      } else {
        const config = contextBuilderOrConfig;
        childBuilder.node.context = async (
          req: Request,
          res: Response,
          parentCtx: TCtx,
        ) => {
          const value = req.params[paramName];

          if (config.validate && !config.validate(value)) {
            if (config.onValidationError) {
              throw config.onValidationError(paramName, value);
            }
            throw new Error(
              `Invalid parameter '${paramName}': validation failed for value '${value}'`,
            );
          }

          const transformed = config.transform
            ? config.transform(value)
            : (value as any);

          return config.loader(req, res, parentCtx, transformed);
        };
      }

      this.children.set(paramSegment, childBuilder);
    }
    return childBuilder.makeConfigurable() as ConfigurableBuilder<
      TCtx & TNewCtx
    >;
  }

  private createMethodBuilder(method: HttpMethod): HttpMethodBuilder<TCtx> {
    const self = this;

    const builder = ((handler: Handler<TCtx>) => {
      if (self.node[method]) {
        logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
      }
      self.node[method] = handler;
    }) as HttpMethodBuilder<TCtx>;

    builder.auth = () => {
      const authBuilder = ((handler: Handler<TCtx & { sub: string }>) => {
        if (self.node[method]) {
          logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
        }
        self.node.authCheck = true;
        self.node[method] = handler as Handler<any>;
      }) as HttpMethodBuilderWithValidate<TCtx & { sub: string }>;

      authBuilder.validate = <TBody = undefined, TQuery = undefined>(schema: {
        body?: (data: any) => TBody;
        query?: (data: any) => TQuery;
      }) => {
        return (
          handler: Handler<
            TCtx & { sub: string } & {
              validatedBody: TBody;
              validatedQuery: TQuery;
            }
          >,
        ) => {
          if (self.node[method]) {
            logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
          }
          self.node.authCheck = true;
          self.node[method] = createValidationWrapper(schema, handler);
        };
      };

      return authBuilder;
    };

    builder.use = (...middleware: RequestHandler[]) => {
      const useBuilder = ((handler: Handler<TCtx>) => {
        if (self.node[method]) {
          logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
        }
        self.node.middleware = [...(self.node.middleware || []), ...middleware];
        self.node[method] = handler;
      }) as HttpMethodBuilderWithValidate<TCtx>;

      useBuilder.validate = <TBody, TQuery>(schema: {
        body?: (data: any) => TBody;
        query?: (data: any) => TQuery;
      }) => {
        return (
          handler: Handler<
            TCtx & { validatedBody: TBody; validatedQuery: TQuery }
          >,
        ) => {
          if (self.node[method]) {
            logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
          }
          self.node.middleware = [
            ...(self.node.middleware || []),
            ...middleware,
          ];
          self.node[method] = createValidationWrapper(schema, handler);
        };
      };

      return useBuilder;
    };

    builder.validate = <TBody, TQuery>(schema: {
      body?: (data: any) => TBody;
      query?: (data: any) => TQuery;
    }) => {
      return (
        handler: Handler<
          TCtx & { validatedBody: TBody; validatedQuery: TQuery }
        >,
      ) => {
        if (self.node[method]) {
          logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
        }
        self.node[method] = createValidationWrapper(schema, handler);
      };
    };

    return builder;
  }

  get get(): HttpMethodBuilder<TCtx> {
    return this.createMethodBuilder("get");
  }

  get post(): HttpMethodBuilder<TCtx> {
    return this.createMethodBuilder("post");
  }

  get patch(): HttpMethodBuilder<TCtx> {
    return this.createMethodBuilder("patch");
  }

  get delete(): HttpMethodBuilder<TCtx> {
    return this.createMethodBuilder("delete");
  }

  getConfig(): RouteNode<TCtx> {
    if (this.children.size > 0) {
      this.node.paths = {};
      for (const [segment, childBuilder] of this.children) {
        this.node.paths[segment] = childBuilder.getConfig();
      }
    }
    return this.node;
  }
}

export function createRoute(): ConfigurableBuilder<{}> {
  const builder = new RouteBuilder<{}>();
  return builder.makeConfigurable();
}
