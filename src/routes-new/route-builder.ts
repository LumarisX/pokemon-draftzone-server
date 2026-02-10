import { Request, RequestHandler, Response, Router } from "express";
import { logger } from "../app";
import { isPDZError, PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";
import { jwtCheck } from "../middleware/jwtcheck";

const HTTP_METHODS = ["get", "post", "patch", "delete"] as const;

type PDZAuthContext = { sub: string };
type PDZRequest = Request & {
  __pdzAuth?: PDZAuthContext;
  __pdzContext?: Record<string, any>;
};

function getPdzAuth(req: Request): PDZAuthContext | undefined {
  return (req as PDZRequest).__pdzAuth;
}

function setPdzAuth(req: Request, auth: PDZAuthContext): void {
  (req as PDZRequest).__pdzAuth = auth;
}

function getPdzContext(req: Request): Record<string, any> | undefined {
  return (req as PDZRequest).__pdzContext;
}

function setPdzContext(req: Request, ctx: Record<string, any>): void {
  (req as PDZRequest).__pdzContext = ctx;
}

function getCtxSub(ctx: unknown): string | undefined {
  const sub = (ctx as { sub?: unknown })?.sub;
  return typeof sub === "string" ? sub : undefined;
}

type HttpMethod = (typeof HTTP_METHODS)[number];

type ContextBuilder<TParentCtx = any, TReturn = any> = (
  parentCtx: TParentCtx,
  req: Request,
  res: Response,
) => TReturn | Promise<TReturn>;

type ParamValidator = (value: string) => boolean;
type ParamTransformer<T> = (value: string) => T;
type ParamLoader<TParentCtx, TTransformed, TReturn> = (
  parentCtx: TParentCtx,
  transformedValue: TTransformed,
  req: Request,
  res: Response,
) => TReturn | Promise<TReturn>;

type ParamConfig<TParentCtx, TTransformed, TReturn> = {
  validate?: ParamValidator;
  transform?: ParamTransformer<TTransformed>;
  loader: ParamLoader<TParentCtx, TTransformed, TReturn>;
  onValidationError?: (paramName: string, value: string) => Error;
};

type Handler<TCtx = any> = (
  ctx: TCtx,
  req: Request,
  res: Response,
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
    this.buildRoute(config, this.router, {}, "");
  }

  private wrapHandler(
    handler: Handler<any>,
    parentContext: Record<string, any>,
  ) {
    return async (req: Request, res: Response) => {
      try {
        let ctx = parentContext;
        const pdzAuth = getPdzAuth(req);
        if (pdzAuth) {
          ctx = { ...ctx, ...pdzAuth };
        }

        const pdzContext = getPdzContext(req);
        if (pdzContext) {
          ctx = { ...ctx, ...pdzContext };
        }

        const result = await handler(ctx, req, res);

        if (!res.headersSent && result !== undefined) {
          return res.json(result);
        }
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

        const routeError = new PDZError(ErrorCodes.SYSTEM.INTERNAL_ERROR, {
          originalError: (error as Error)?.message,
        });

        return res.status(routeError.status).json(routeError.toJSON());
      }
    };
  }

  private buildRoute(
    node: RouteNode<any>,
    router: Router,
    parentContext: Record<string, any>,
    basePath: string,
  ) {
    const pathPrefix = basePath || "/";

    if (node.middleware) {
      router.use(pathPrefix, ...node.middleware);
    }

    if (node.authCheck) {
      router.use(pathPrefix, async (req: Request, res: Response, next) => {
        try {
          await executeAuthCheck(req, res);
          setPdzAuth(req, { sub: req.auth!.payload.sub! });
          next();
        } catch (error) {
          if (isPDZError(error)) {
            return res.status(error.status).json(error.toJSON());
          }
          logger.error("Auth check error", { error });
          const authError = new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
          return res.status(authError.status).json(authError.toJSON());
        }
      });
    }

    if (node.context) {
      router.use(pathPrefix, async (req: Request, res: Response, next) => {
        try {
          let ctx = parentContext;
          const pdzAuth = getPdzAuth(req);
          if (pdzAuth) {
            ctx = { ...ctx, ...pdzAuth };
          }
          const pdzContext = getPdzContext(req);
          if (pdzContext) {
            ctx = { ...ctx, ...pdzContext };
          }
          const nodeContext = await node.context!(ctx, req, res);

          setPdzContext(req, {
            ...(getPdzContext(req) || {}),
            ...nodeContext,
          });
          next();
        } catch (error) {
          if (isPDZError(error)) {
            return res.status(error.status).json(error.toJSON());
          }
          logger.error("Context builder error", { error, path: req.path });
          const contextError = new PDZError(ErrorCodes.SYSTEM.MISSING_CONTEXT, {
            originalError: (error as Error)?.message,
          });
          return res.status(contextError.status).json(contextError.toJSON());
        }
      });
    }

    for (const method of HTTP_METHODS) {
      if (node[method]) {
        router[method](
          pathPrefix,
          this.wrapHandler(node[method]!, parentContext),
        );
      }
    }

    if (node.paths) {
      for (const [segment, childNode] of Object.entries(node.paths)) {
        const childPath = basePath ? `${basePath}/${segment}` : `/${segment}`;
        this.buildRoute(childNode, router, parentContext, childPath);
      }
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

function createMiddlewareWrapper<TCtx>(
  middleware: RequestHandler[],
  handler: Handler<TCtx>,
): Handler<TCtx> {
  return async (ctx: TCtx, req: Request, res: Response) => {
    for (const mw of middleware) {
      if (res.headersSent) return;

      await new Promise<void>((resolve, reject) => {
        mw(req, res, (err?: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    if (!res.headersSent) return handler(ctx, req, res);
  };
}

async function executeAuthCheck(
  req: Request,
  res: Response,
): Promise<{ sub: string }> {
  return new Promise((resolve, reject) => {
    jwtCheck(req, res, (err?: any) => {
      if (err) reject(err);
      else resolve({ sub: req.auth!.payload.sub! });
    });
  });
}

function createAuthWrapper<TCtx>(
  handler: Handler<TCtx & { sub: string }>,
): Handler<TCtx> {
  return async (ctx: TCtx, req: Request, res: Response) => {
    let authData = getPdzAuth(req);

    if (!authData) {
      const ctxSub = getCtxSub(ctx);
      if (ctxSub) {
        authData = { sub: ctxSub };
        setPdzAuth(req, authData);
      }
    }

    if (!authData) {
      try {
        authData = await executeAuthCheck(req, res);
        setPdzAuth(req, authData);
      } catch (error) {
        if (isPDZError(error)) {
          return res.status(error.status).json(error.toJSON());
        }
        logger.error("Method-level auth check error", { error });
        const authError = new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
        return res.status(authError.status).json(authError.toJSON());
      }
    }

    const authCtx = { ...ctx, ...authData } as TCtx & { sub: string };
    return handler(authCtx, req, res);
  };
}

function createValidationWrapper<TBody, TQuery, TCtx>(
  schema: {
    body?: (data: any) => TBody;
    query?: (data: any) => TQuery;
  },
  handler: Handler<TCtx & { validatedBody: TBody; validatedQuery: TQuery }>,
): Handler<TCtx> {
  return async (ctx: TCtx, req: Request, res: Response) => {
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

    return handler(validatedCtx, req, res);
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
  use(...middleware: RequestHandler[]): HttpMethodBuilderWithValidate<TCtx>;
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
    loader: ParamLoader<TCtx, string, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TTransformed = string, TNewCtx = any>(
    paramName: string,
    config: ParamConfig<TCtx, TTransformed, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TTransformed = string, TNewCtx = any>(
    paramName: string,
    contextBuilderOrConfig:
      | ParamLoader<TCtx, string, TNewCtx>
      | ParamConfig<TCtx, TTransformed, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx> {
    const paramSegment = `:${paramName}`;
    let childBuilder = this.children.get(paramSegment);
    if (!childBuilder) {
      childBuilder = new RouteBuilder<TCtx & TNewCtx>();

      if (typeof contextBuilderOrConfig === "function") {
        childBuilder.node.context = async (
          parentCtx: TCtx,
          req: Request,
          res: Response,
        ) => {
          const value = req.params[paramName];
          return contextBuilderOrConfig(parentCtx, value, req, res);
        };
      } else {
        const config = contextBuilderOrConfig;
        childBuilder.node.context = async (
          parentCtx: TCtx,
          req: Request,
          res: Response,
        ) => {
          const value = req.params[paramName];

          if (config.validate && !config.validate(value)) {
            if (config.onValidationError)
              throw config.onValidationError(paramName, value);
            throw new Error(
              `Invalid parameter '${paramName}': validation failed for value '${value}'`,
            );
          }
          const transformed = config.transform
            ? config.transform(value)
            : (value as any);
          return config.loader(parentCtx, transformed, req, res);
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
        self.node[method] = createAuthWrapper(handler) as Handler<any>;
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
          const validatedHandler = createValidationWrapper(schema, handler);
          self.node[method] = createAuthWrapper(validatedHandler);
        };
      };

      authBuilder.use = (...middleware: RequestHandler[]) => {
        const useBuilder = ((handler: Handler<TCtx & { sub: string }>) => {
          if (self.node[method]) {
            logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
          }
          self.node[method] = createAuthWrapper(
            createMiddlewareWrapper(middleware, handler),
          );
        }) as HttpMethodBuilderWithValidate<TCtx & { sub: string }>;

        useBuilder.validate = <TBody = undefined, TQuery = undefined>(schema: {
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
              logger.warn(
                `Overwriting existing ${method.toUpperCase()} handler`,
              );
            }
            const validatedHandler = createValidationWrapper(schema, handler);
            self.node[method] = createAuthWrapper(
              createMiddlewareWrapper(middleware, validatedHandler),
            );
          };
        };

        useBuilder.use = (...moreMiddleware: RequestHandler[]) => {
          return builder.auth().use(...middleware, ...moreMiddleware);
        };

        return useBuilder;
      };

      return authBuilder;
    };

    builder.use = (...middleware: RequestHandler[]) => {
      const useBuilder = ((handler: Handler<TCtx>) => {
        if (self.node[method]) {
          logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
        }
        self.node[method] = createMiddlewareWrapper(middleware, handler);
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
          const validatedHandler = createValidationWrapper(schema, handler);
          self.node[method] = createMiddlewareWrapper(
            middleware,
            validatedHandler,
          );
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
