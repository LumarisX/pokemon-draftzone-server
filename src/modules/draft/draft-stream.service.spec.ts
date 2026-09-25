import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { MessageEvent } from "@nestjs/common";
import { Types } from "mongoose";
import { Subscription } from "rxjs";
import { DraftStreamService, HEARTBEAT_MS } from "./draft-stream.service";

const TOURNAMENT_ID = new Types.ObjectId().toString();
const TOURNAMENT_SLUG = "spring-cup";

const tournament = {
  id: TOURNAMENT_ID,
  slug: TOURNAMENT_SLUG,
  owner: "auth0|owner",
  staff: [],
} as unknown as HostedTournament;

describe("DraftStreamService", () => {
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: DraftStreamService;
  let subscriptions: Subscription[];

  beforeEach(() => {
    coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;
    service = new DraftStreamService(coachRepo, teamRepo);
    subscriptions = [];
  });

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    jest.useRealTimers();
  });

  function coachOf(teamId: Types.ObjectId, status = "approved") {
    coachRepo.findByAuth0Id.mockResolvedValueOnce([{ teamId } as never]);
    teamRepo.findManyByIds.mockResolvedValueOnce([
      {
        _id: teamId,
        tournamentId: { toString: () => TOURNAMENT_ID },
        status,
      } as never,
    ]);
  }

  async function listen(sub: string | null, forTournament = tournament) {
    const received: MessageEvent[] = [];
    const stream = await service.streamFor(forTournament, sub);
    subscriptions.push(stream.subscribe((message) => received.push(message)));
    return received;
  }

  function completed(draftPublic: boolean, blindTeamId?: string) {
    return {
      tournamentSlug: TOURNAMENT_SLUG,
      draftSlug: "pool-a",
      audience: { draftPublic, ...(blindTeamId ? { blindTeamId } : {}) },
      draftName: "Pool A",
    };
  }

  const ofType = (received: MessageEvent[], type: string) =>
    received.filter((message) => message.type === type);

  it("sends a public draft's events to everyone, without the audience", async () => {
    const anonymous = await listen(null);

    service.onDraftCompleted(completed(true));

    const [message] = ofType(anonymous, "league.draft.completed");
    expect(message.data).toMatchObject({ draftName: "Pool A" });
    expect(message.data).not.toHaveProperty("audience");
  });

  it("only sends a tournament's own events", async () => {
    const other = await listen(null, {
      ...tournament,
      slug: "autumn-cup",
    } as HostedTournament);

    service.onDraftCompleted(completed(true));

    expect(other).toEqual([]);
  });

  it("sends a private draft's events only to staff and approved coaches", async () => {
    const anonymous = await listen(null);
    const stranger = await listen("auth0|stranger");
    const owner = await listen("auth0|owner");
    coachOf(new Types.ObjectId());
    const coach = await listen("auth0|coach");

    service.onDraftCompleted(completed(false));

    expect(anonymous).toEqual([]);
    expect(stranger).toEqual([]);
    expect(ofType(owner, "league.draft.completed")).toHaveLength(1);
    expect(ofType(coach, "league.draft.completed")).toHaveLength(1);
  });

  it("does not count a pending or dropped team as membership", async () => {
    coachOf(new Types.ObjectId(), "dropped");
    const dropped = await listen("auth0|dropped");

    service.onDraftCompleted(completed(false));

    expect(dropped).toEqual([]);
  });

  it("sends a keepalive comment on an idle stream", async () => {
    jest.useFakeTimers();
    const anonymous = await listen(null);

    jest.advanceTimersByTime(HEARTBEAT_MS);

    expect(anonymous).toEqual([{ comment: "keepalive" }]);
  });

  describe("blind drafts", () => {
    const blindTeamId = new Types.ObjectId();

    function pickEvent() {
      return {
        tournamentSlug: TOURNAMENT_SLUG,
        draftSlug: "pool-a",
        audience: { draftPublic: true, blindTeamId: blindTeamId.toString() },
        pick: { team: "Team A", draft: "pool-a", pokemon: { id: "pikachu" } },
        team: {
          id: blindTeamId.toString(),
          name: "Team A",
          draft: [{ id: "pikachu" }],
        },
        pokemon: { id: "pikachu" },
      } as never;
    }

    it("hides the pick from everyone but the picking team and staff", async () => {
      const anonymous = await listen(null);
      coachOf(new Types.ObjectId());
      const rival = await listen("auth0|rival");
      coachOf(blindTeamId);
      const picker = await listen("auth0|picker");
      const owner = await listen("auth0|owner");

      service.onDraftAdded(pickEvent());

      for (const viewer of [anonymous, rival]) {
        const data = ofType(viewer, "league.draft.added")[0].data as Record<
          string,
          unknown
        >;
        expect(data).not.toHaveProperty("pokemon");
        expect(data["pick"]).toEqual({ team: "Team A", draft: "pool-a" });
        expect(data["team"]).toEqual({
          id: blindTeamId.toString(),
          name: "Team A",
          draft: [],
        });
      }
      for (const viewer of [picker, owner]) {
        expect(ofType(viewer, "league.draft.added")[0].data).toMatchObject({
          pokemon: { id: "pikachu" },
          team: { draft: [{ id: "pikachu" }] },
        });
      }
    });

    it("redacts an organizer's roster edit the same way", async () => {
      const anonymous = await listen(null);

      service.onDraftPickUpdated({
        ...(pickEvent() as object),
        previous: { id: "eevee" },
      } as never);

      const data = ofType(anonymous, "league.draft.updated")[0].data;
      expect(data).not.toHaveProperty("pokemon");
      expect(data).not.toHaveProperty("previous");
    });

    it("sends unredacted status events in a blind draft", async () => {
      const anonymous = await listen(null);

      service.onDraftCompleted(completed(true, blindTeamId.toString()));

      expect(ofType(anonymous, "league.draft.completed")[0].data).toMatchObject(
        { draftName: "Pool A" },
      );
    });
  });
});
