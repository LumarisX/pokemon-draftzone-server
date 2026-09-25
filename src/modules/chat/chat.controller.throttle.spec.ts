import { BusinessExceptionFilter } from "@core/filters/business-exception.filter";
import { GlobalThrottlerGuard } from "@core/guards/global-throttler.guard";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

const CHAT_LIMIT = 20;

describe("ChatController posting limit over HTTP", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [ChatController],
      providers: [
        { provide: APP_GUARD, useClass: GlobalThrottlerGuard },
        {
          provide: ChatService,
          useValue: { postMessage: jest.fn().mockResolvedValue({ ok: true }) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest();
          const sub = request.headers["x-test-sub"];
          request.user = sub ? { sub } : null;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new BusinessExceptionFilter());
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace("[::1]", "localhost");
  });

  afterEach(async () => {
    await app.close();
  });

  function post(sub: string) {
    return fetch(
      `${baseUrl}/leagues/spring/tournaments/spring-cup/chat/tournament`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-sub": sub },
        body: JSON.stringify({ text: "hello" }),
      },
    );
  }

  it("limits each user separately and answers with a readable 429", async () => {
    for (let i = 0; i < CHAT_LIMIT; i++) {
      expect((await post("auth0|chatty")).status).toBe(201);
    }

    const refused = await post("auth0|chatty");
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error.code).toBe("SYS-006");

    expect((await post("auth0|quiet")).status).toBe(201);
  });
});
