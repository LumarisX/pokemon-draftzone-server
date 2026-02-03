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

export class RouteBuilder<TCtx = {}> {
  private node: RouteNode<TCtx> = {};
  private children: Map<string, RouteBuilder<any>> = new Map();

  context<TNewCtx>(builder: ContextBuilder<TCtx, TNewCtx>): void {
    this.node.context = builder;
  }

  auth(): void {
    this.node.authCheck = true;
  }

  use(...middleware: RequestHandler[]): void {
    this.node.middleware = [...(this.node.middleware || []), ...middleware];
  }

  path(
    segment: string,
    configure: (builder: RouteBuilder<TCtx>) => void,
  ): void {
    let childBuilder = this.children.get(segment);
    if (!childBuilder) {
      childBuilder = new RouteBuilder<TCtx>();
      this.children.set(segment, childBuilder);
    }

    configure(childBuilder);
  }

  get(handler: Handler<TCtx>): void {
    if (this.node.get) {
      logger.warn("Overwriting existing GET handler");
    }
    this.node.get = handler;
  }

  post(handler: Handler<TCtx>): void {
    if (this.node.post) {
      logger.warn("Overwriting existing POST handler");
    }
    this.node.post = handler;
  }

  patch(handler: Handler<TCtx>): void {
    if (this.node.patch) {
      logger.warn("Overwriting existing PATCH handler");
    }
    this.node.patch = handler;
  }

  delete(handler: Handler<TCtx>): void {
    if (this.node.delete) {
      logger.warn("Overwriting existing DELETE handler");
    }
    this.node.delete = handler;
  }

  param<TNewCtx>(
    paramName: string,
    contextBuilder: ContextBuilder<TCtx, TNewCtx>,
    configure: (builder: RouteBuilder<TCtx & TNewCtx>) => void,
  ): void {
    this.path(`:${paramName}`, (childBuilder) => {
      childBuilder.context(async (req, res, parentCtx) => {
        const value = req.params[paramName];
        return contextBuilder(req, res, parentCtx, value);
      });
      configure(childBuilder as RouteBuilder<TCtx & TNewCtx>);
    });
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
        if (node.authCheck) {
          await this.executeAuthCheck(req, res);
        }
        let ctx = parentContext;
        if (node.context) {
          const nodeContext = await node.context(req, res, parentContext, "");
          ctx = Object.assign(Object.create(null), parentContext, nodeContext);
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

export function createRoute(
  configure: (builder: RouteBuilder<{}>) => void,
): Router {
  const builder = new RouteBuilder<{}>();
  configure(builder);
  const route = new Route(builder.getConfig());
  return route.getRouter();
}
