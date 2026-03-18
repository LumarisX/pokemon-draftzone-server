import {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";
import { logger } from "../app";
import { isPDZError, PDZError } from "../errors/pdz-error";
import { ErrorCodes } from "../errors/error-codes";
import { jwtCheck } from "../middleware/jwtcheck";

const HTTP_METHODS = ["get", "post", "patch", "delete"] as const;

type PDZAuthContext = { sub: string };
type PDZRouteLocals = {
  __pdzAuth?: PDZAuthContext;
  __pdzContext?: Record<string, any>;
};

function getLocals(res: Response): PDZRouteLocals {
  return res.locals as PDZRouteLocals;
}

function getPdzAuth(res: Response): PDZAuthContext | undefined {
  return getLocals(res).__pdzAuth;
}

function setPdzAuth(res: Response, auth: PDZAuthContext): void {
  getLocals(res).__pdzAuth = auth;
}

function getPdzContext(res: Response): Record<string, any> | undefined {
  return getLocals(res).__pdzContext;
}

function setPdzContext(res: Response, ctx: Record<string, any>): void {
  getLocals(res).__pdzContext = ctx;
}

type HttpMethod = (typeof HTTP_METHODS)[number];

type ContextBuilder<TParentCtx = any, TReturn = any> = (
  parentCtx: TParentCtx,
  req: Request,
  res: Response,
) => TReturn | Promise<TReturn>;

type ParamValidator = (value: string) => boolean;
type ParamLoader<TParentCtx, TReturn> = (
  parentCtx: TParentCtx,
  value: string,
  req: Request,
  res: Response,
) => TReturn | Promise<TReturn>;

type ParamConfig<TParentCtx, TReturn> = {
  validate?: ParamValidator;
  loader: ParamLoader<TParentCtx, TReturn>;
};

type Handler<TCtx = any> = (
  ctx: TCtx,
  req: Request,
  res: Response,
) => Promise<any> | any;

type MethodHandler = { [m in HttpMethod]: Handler };
type MethodMiddleware = Partial<Record<HttpMethod, RequestHandler[]>>;

type RouteNode<TParentCtx = any> = Partial<MethodHandler> & {
  methodMiddleware?: MethodMiddleware;
  context?: ContextBuilder<TParentCtx, any>;
  authCheck?: boolean;
  middleware?: RequestHandler[];
  paths?: {
    [segment: string]: RouteNode<any>;
  };
};

const routeErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

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
};

function getRequestContext(res: Response): Record<string, any> {
  const pdzAuth = getPdzAuth(res);
  const pdzContext = getPdzContext(res);

  if (pdzAuth && pdzContext) return { ...pdzAuth, ...pdzContext };
  if (pdzAuth) return { ...pdzAuth };
  if (pdzContext) return { ...pdzContext };

  return {};
}

async function getRequestAuth(
  req: Request,
  res: Response,
  useContextSub = false,
): Promise<PDZAuthContext> {
  let authData = getPdzAuth(res);

  if (!authData && useContextSub) {
    const contextSub = getPdzContext(res)?.sub;

    if (typeof contextSub === "string") {
      authData = { sub: contextSub };
      setPdzAuth(res, authData);
    }
  }

  if (authData) return authData;

  try {
    authData = await executeAuthCheck(req, res);
    setPdzAuth(res, authData);
    return authData;
  } catch (error) {
    if (isPDZError(error)) throw error;

    logger.error("Auth check error", { error });
    throw new PDZError(ErrorCodes.AUTH.INVALID_TOKEN);
  }
}

export class Route {
  private router: Router;

  constructor(config: RouteNode<any>) {
    this.router = Router();
    this.buildRoute(config, this.router, "");
    this.router.use(routeErrorHandler);
  }

  private wrapHandler(handler: Handler<any>) {
    return async (req: Request, res: Response) => {
      const ctx = getRequestContext(res);
      const result = await handler(ctx, req, res);

      if (!res.headersSent && result !== undefined) return res.json(result);
    };
  }

  private buildRoute(node: RouteNode<any>, router: Router, basePath: string) {
    const pathPrefix = basePath || "/";

    if (node.authCheck) {
      router.use(pathPrefix, async (req: Request, res: Response, next) => {
        await getRequestAuth(req, res);
        next();
      });
    }

    if (node.middleware) {
      router.use(pathPrefix, ...node.middleware);
    }

    if (node.context) {
      router.use(pathPrefix, async (req: Request, res: Response, next) => {
        const ctx = getRequestContext(res);
        let nodeContext;

        try {
          nodeContext = await node.context!(ctx, req, res);
        } catch (error) {
          if (isPDZError(error)) throw error;

          logger.error("Context builder error", { error, path: req.path });
          throw new PDZError(ErrorCodes.SYSTEM.MISSING_CONTEXT, {
            originalError: (error as Error)?.message,
          });
        }

        setPdzContext(res, {
          ...(getPdzContext(res) || {}),
          ...nodeContext,
        });
        next();
      });
    }

    for (const method of HTTP_METHODS) {
      if (node[method]) {
        const methodMiddleware = node.methodMiddleware?.[method] || [];
        router[method](
          pathPrefix,
          ...methodMiddleware,
          this.wrapHandler(node[method]!),
        );
      }
    }

    if (node.paths) {
      for (const [segment, childNode] of Object.entries(node.paths)) {
        const childPath = basePath ? `${basePath}/${segment}` : `/${segment}`;
        this.buildRoute(childNode, router, childPath);
      }
    }
  }

  getRouter(): Router {
    return this.router;
  }
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

function createAuthMiddleware(): RequestHandler {
  return async (req: Request, res: Response, next) => {
    await getRequestAuth(req, res, true);
    next();
  };
}

function createValidationMiddleware<TBody, TQuery>(schema: {
  body?: (data: any) => TBody;
  query?: (data: any) => TQuery;
}): RequestHandler {
  return (req: Request, res: Response, next) => {
    const validatedContext: Record<string, any> = {};

    if (schema.body) {
      try {
        validatedContext.validatedBody = schema.body(req.body);
      } catch (error) {
        logger.warn("Body validation failed", { error });
        return next(error);
      }
    }

    if (schema.query) {
      try {
        validatedContext.validatedQuery = schema.query(req.query);
      } catch (error) {
        logger.warn("Query validation failed", { error });
        return next(error);
      }
    }

    setPdzContext(res, {
      ...(getPdzContext(res) || {}),
      ...validatedContext,
    });

    next();
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
    loader: ParamLoader<TCtx, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TNewCtx = any>(
    paramName: string,
    config: ParamConfig<TCtx, TNewCtx>,
  ): ConfigurableBuilder<TCtx & TNewCtx>;
  param<TNewCtx = any>(
    paramName: string,
    contextBuilderOrConfig:
      | ParamLoader<TCtx, TNewCtx>
      | ParamConfig<TCtx, TNewCtx>,
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
            throw new Error(
              `Invalid parameter '${paramName}': validation failed for value '${value}'`,
            );
          }
          return config.loader(parentCtx, value, req, res);
        };
      }

      this.children.set(paramSegment, childBuilder);
    }
    return childBuilder.makeConfigurable() as ConfigurableBuilder<
      TCtx & TNewCtx
    >;
  }

  private setMethodRoute<TMethodCtx>(
    method: HttpMethod,
    handler: Handler<TMethodCtx>,
    methodMiddleware: RequestHandler[] = [],
  ): void {
    if (this.node[method]) {
      logger.warn(`Overwriting existing ${method.toUpperCase()} handler`);
    }

    this.node[method] = handler as Handler<any>;

    if (methodMiddleware.length > 0) {
      this.node.methodMiddleware = this.node.methodMiddleware || {};
      this.node.methodMiddleware[method] = methodMiddleware;
      return;
    }

    if (this.node.methodMiddleware) {
      delete this.node.methodMiddleware[method];

      if (Object.keys(this.node.methodMiddleware).length === 0) {
        delete this.node.methodMiddleware;
      }
    }
  }

  private createValidationConfigurer<TMethodCtx>(
    method: HttpMethod,
    middleware: RequestHandler[],
  ) {
    return <TBody = undefined, TQuery = undefined>(schema: {
      body?: (data: any) => TBody;
      query?: (data: any) => TQuery;
    }) => {
      return (
        handler: Handler<
          TMethodCtx & { validatedBody: TBody; validatedQuery: TQuery }
        >,
      ) => {
        this.setMethodRoute(method, handler, [
          ...middleware,
          createValidationMiddleware(schema),
        ]);
      };
    };
  }

  private createMethodBuilderWithValidate<TMethodCtx>(
    method: HttpMethod,
    middleware: RequestHandler[],
  ): HttpMethodBuilderWithValidate<TMethodCtx> {
    const builder = ((handler: Handler<TMethodCtx>) => {
      this.setMethodRoute(method, handler, middleware);
    }) as HttpMethodBuilderWithValidate<TMethodCtx>;

    builder.validate = this.createValidationConfigurer<TMethodCtx>(
      method,
      middleware,
    );

    builder.use = (...moreMiddleware: RequestHandler[]) => {
      return this.createMethodBuilderWithValidate<TMethodCtx>(method, [
        ...middleware,
        ...moreMiddleware,
      ]);
    };

    return builder;
  }

  private createMethodBuilder(method: HttpMethod): HttpMethodBuilder<TCtx> {
    const builder = ((handler: Handler<TCtx>) => {
      this.setMethodRoute(method, handler);
    }) as HttpMethodBuilder<TCtx>;

    builder.auth = () => {
      const authMiddleware = createAuthMiddleware();

      return this.createMethodBuilderWithValidate<TCtx & { sub: string }>(
        method,
        [authMiddleware],
      );
    };

    builder.use = (...middleware: RequestHandler[]) => {
      return this.createMethodBuilderWithValidate<TCtx>(method, middleware);
    };

    builder.validate = this.createValidationConfigurer<TCtx>(method, []);

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
