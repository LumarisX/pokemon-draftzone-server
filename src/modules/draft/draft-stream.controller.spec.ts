import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZError } from "@core/pdz-error";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DraftStreamController } from "./draft-stream.controller";
import { DraftStreamService } from "./draft-stream.service";

const TOURNAMENT = {
  id: "t1",
  slug: "spring-cup",
  owner: "auth0|owner",
  staff: [],
};

describe("DraftStreamController over HTTP", () => {
  let app: INestApplication;
  let baseUrl: string;
  let stream: DraftStreamService;
  let findBySlug: jest.Mock;

  beforeEach(async () => {
    findBySlug = jest.fn().mockResolvedValue(TOURNAMENT);
    const moduleRef = await Test.createTestingModule({
      controllers: [DraftStreamController],
      providers: [
        DraftStreamService,
        { provide: HostedTournamentRepository, useValue: { findBySlug } },
        {
          provide: CoachRepository,
          useValue: { findByAuth0Id: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: TeamRepository,
          useValue: { findManyByIds: jest.fn().mockResolvedValue([]) },
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
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace("[::1]", "localhost");
    stream = app.get(DraftStreamService);
  });

  afterEach(async () => {
    await app.close();
  });

  async function readUntil(
    response: Response,
    marker: string,
  ): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes(marker)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return text;
  }

  it("streams draft events as named server-sent events", async () => {
    const controller = new AbortController();
    const response = await fetch(
      `${baseUrl}/leagues/pdz/tournaments/spring-cup/draft-events`,
      { signal: controller.signal },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(findBySlug).toHaveBeenCalledWith("pdz", "spring-cup");

    setTimeout(
      () =>
        stream.onDraftCompleted({
          tournamentSlug: "spring-cup",
          poolSlug: "pool-a",
          audience: { draftPublic: true },
          poolName: "Pool A",
        }),
      20,
    );
    const text = await readUntil(response, "\n\n");
    controller.abort();

    expect(text).toContain("event: league.draft.completed\n");
    const dataLine = text
      .split("\n")
      .find((line) => line.startsWith("data: "))!;
    expect(JSON.parse(dataLine.slice(6))).toEqual({
      tournamentSlug: "spring-cup",
      poolSlug: "pool-a",
      poolName: "Pool A",
    });
  });

  it("answers an unknown tournament with its error status before streaming", async () => {
    findBySlug.mockRejectedValue(
      new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { tournamentSlug: "nope" }),
    );

    const response = await fetch(
      `${baseUrl}/leagues/pdz/tournaments/nope/draft-events`,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
  });
});
