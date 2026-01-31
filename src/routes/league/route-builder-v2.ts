import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";

/**
 * Base context type - can be extended by specific routes
 */
export type RouteContext = Record<string, any>;

/**
 * Handler with typed context
 */
export type TypedHandler<TContext extends RouteContext = RouteContext> = (
  req: Request,
  res: Response,
  ctx: TContext,
) => Promise<any> | any;

/**
 * Context middleware that loads data and returns additional context properties
 */
export type ContextLoader<
  TContext extends RouteContext = RouteContext,
  TAdditional extends RouteContext = RouteContext,
> = (
  req: Request,
  res: Response,
  ctx: TContext,
) => Promise<TAdditional> | TAdditional;

/**
 * Scope configuration options
 */
export type ScopeConfig<
  TContext extends RouteContext = RouteContext,
  TAdditional extends RouteContext = RouteContext,
> = {
  path?: string;
  load?: ContextLoader<TContext, TAdditional>;
  auth?: RequestHandler | RequestHandler[];
  validate?: RequestHandler | RequestHandler[];
  rateLimit?: RequestHandler;
  cache?: RequestHandler;
  middleware?: RequestHandler[];
};

/**
 * Route handler with optional inline configuration
 */
export type RouteConfig<TContext extends RouteContext = RouteContext> = {
  handler: TypedHandler<TContext>;
  auth?: RequestHandler | RequestHandler[];
  validate?: RequestHandler | RequestHandler[];
  middleware?: RequestHandler[];
};

/**
 * Wraps a typed handler to work with Express and handle errors automatically
 */
function wrapHandler<TContext extends RouteContext>(
  handler: TypedHandler<TContext>,
  contextLoaders: ContextLoader<any, any>[],
  middleware: RequestHandler[],
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Apply Express middleware first
      for (const mw of middleware) {
        await new Promise<void>((resolve, reject) => {
          mw(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Build context by running all loaders in sequence
      let ctx: any = {};
      for (const loader of contextLoaders) {
        const additionalContext = await loader(req, res, ctx);
        ctx = { ...ctx, ...additionalContext };
      }

      // Run the handler with the built context
      await handler(req, res, ctx);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Extract middleware from scope config
 */
function extractMiddleware(config: ScopeConfig<any, any>): RequestHandler[] {
  const middleware: RequestHandler[] = [];

  if (config.auth) {
    middleware.push(
      ...(Array.isArray(config.auth) ? config.auth : [config.auth]),
    );
  }
  if (config.validate) {
    middleware.push(
      ...(Array.isArray(config.validate) ? config.validate : [config.validate]),
    );
  }
  if (config.rateLimit) {
    middleware.push(config.rateLimit);
  }
  if (config.cache) {
    middleware.push(config.cache);
  }
  if (config.middleware) {
    middleware.push(...config.middleware);
  }

  return middleware;
}

/**
 * Route builder with fluent API and type-safe context
 */
export class RouteBuilder<TContext extends RouteContext = RouteContext> {
  private router: Router;
  private contextLoaders: ContextLoader<any, any>[] = [];
  private middleware: RequestHandler[] = [];
  private basePath: string = "";

  constructor(basePath: string = "") {
    this.router = Router();
    this.basePath = basePath;
  }

  /**
   * Add context loader that adds data to context
   * Returns a new RouteBuilder with extended context type
   */
  load<TAdditional extends RouteContext>(
    loader: ContextLoader<TContext, TAdditional>,
  ): RouteBuilder<TContext & TAdditional> {
    const newBuilder = new RouteBuilder<TContext & TAdditional>(this.basePath);
    newBuilder.router = this.router;
    newBuilder.contextLoaders = [...this.contextLoaders, loader];
    newBuilder.middleware = [...this.middleware];
    return newBuilder;
  }

  /**
   * Register a GET route
   */
  get(
    path: string,
    handlerOrConfig: TypedHandler<TContext> | RouteConfig<TContext>,
  ): this {
    const handler =
      typeof handlerOrConfig === "function"
        ? handlerOrConfig
        : handlerOrConfig.handler;

    const routeMiddleware =
      typeof handlerOrConfig === "object"
        ? extractMiddleware(handlerOrConfig as any)
        : [];

    this.router.get(
      path,
      wrapHandler(handler, this.contextLoaders, [
        ...this.middleware,
        ...routeMiddleware,
      ]),
    );
    return this;
  }

  /**
   * Register a POST route
   */
  post(
    path: string,
    handlerOrConfig: TypedHandler<TContext> | RouteConfig<TContext>,
  ): this {
    const handler =
      typeof handlerOrConfig === "function"
        ? handlerOrConfig
        : handlerOrConfig.handler;

    const routeMiddleware =
      typeof handlerOrConfig === "object"
        ? extractMiddleware(handlerOrConfig as any)
        : [];

    this.router.post(
      path,
      wrapHandler(handler, this.contextLoaders, [
        ...this.middleware,
        ...routeMiddleware,
      ]),
    );
    return this;
  }

  /**
   * Register a PATCH route
   */
  patch(
    path: string,
    handlerOrConfig: TypedHandler<TContext> | RouteConfig<TContext>,
  ): this {
    const handler =
      typeof handlerOrConfig === "function"
        ? handlerOrConfig
        : handlerOrConfig.handler;

    const routeMiddleware =
      typeof handlerOrConfig === "object"
        ? extractMiddleware(handlerOrConfig as any)
        : [];

    this.router.patch(
      path,
      wrapHandler(handler, this.contextLoaders, [
        ...this.middleware,
        ...routeMiddleware,
      ]),
    );
    return this;
  }

  /**
   * Register a DELETE route
   */
  delete(
    path: string,
    handlerOrConfig: TypedHandler<TContext> | RouteConfig<TContext>,
  ): this {
    const handler =
      typeof handlerOrConfig === "function"
        ? handlerOrConfig
        : handlerOrConfig.handler;

    const routeMiddleware =
      typeof handlerOrConfig === "object"
        ? extractMiddleware(handlerOrConfig as any)
        : [];

    this.router.delete(
      path,
      wrapHandler(handler, this.contextLoaders, [
        ...this.middleware,
        ...routeMiddleware,
      ]),
    );
    return this;
  }

  /**
   * Create a scope with optional path, context loaders, and middleware
   * All routes defined in the callback inherit the scope's configuration
   */
  scope<TAdditional extends RouteContext = {}>(
    config: ScopeConfig<TContext, TAdditional>,
    configure: (builder: RouteBuilder<TContext & TAdditional>) => void,
  ): this;
  scope<TAdditional extends RouteContext = {}>(
    configure: (builder: RouteBuilder<TContext>) => void,
  ): this;
  scope<TAdditional extends RouteContext = {}>(
    configOrFn:
      | ScopeConfig<TContext, TAdditional>
      | ((builder: RouteBuilder<TContext>) => void),
    configureFn?: (builder: RouteBuilder<TContext & TAdditional>) => void,
  ): this {
    // Handle overload: if first arg is function, no config provided
    if (typeof configOrFn === "function") {
      const fn = configOrFn;
      const scopeBuilder = new RouteBuilder<TContext>();
      scopeBuilder.contextLoaders = [...this.contextLoaders];
      scopeBuilder.middleware = [...this.middleware];

      fn(scopeBuilder);

      this.router.use(scopeBuilder.build());
      return this;
    }

    // Full config provided
    const config = configOrFn;
    const fn = configureFn!;

    const scopeBuilder = new RouteBuilder<TContext & TAdditional>(config.path);
    scopeBuilder.contextLoaders = [...this.contextLoaders];
    scopeBuilder.middleware = [...this.middleware];

    // Add loader if provided
    if (config.load) {
      scopeBuilder.contextLoaders.push(config.load);
    }

    // Add middleware from config
    const scopeMiddleware = extractMiddleware(config);
    scopeBuilder.middleware.push(...scopeMiddleware);

    fn(scopeBuilder);

    if (config.path) {
      this.router.use(config.path, scopeBuilder.build());
    } else {
      this.router.use(scopeBuilder.build());
    }

    return this;
  }

  /**
   * Pipes this builder through a transformation function.
   * Useful for composing route modules in a chainable way.
   *
   * @example
   * const routes = createRoute()
   *   .pipe(addAdListRoutes)
   *   .pipe(addLeagueInfoRoutes)
   *   .build();
   */
  pipe<TNewContext extends TContext>(
    fn: (builder: RouteBuilder<TContext>) => RouteBuilder<TNewContext>,
  ): RouteBuilder<TNewContext> {
    return fn(this);
  }

  /**
   * Build and return the Express Router
   */
  build(): Router {
    return this.router;
  }
}

/**
 * Factory function to create a new route builder
 */
export function createRoute<TContext extends RouteContext = {}>(
  basePath?: string,
): RouteBuilder<TContext> {
  return new RouteBuilder<TContext>(basePath);
}
