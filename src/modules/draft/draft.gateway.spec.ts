jest.mock("jwks-rsa", () => ({ JwksClient: jest.fn() }));

import { WsAuthService } from "@modules/auth/ws-auth.service";
import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Types } from "mongoose";
import { DraftGateway } from "./draft.gateway";

const TOURNAMENT_ID = new Types.ObjectId().toString();
const TOURNAMENT_SLUG = "spring-cup";

function buildTournament() {
  return {
    id: TOURNAMENT_ID,
    slug: TOURNAMENT_SLUG,
    owner: "auth0|owner",
    staff: [],
  };
}

function buildSocket(token?: string) {
  return {
    handshake: { auth: token ? { token } : {} },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
  };
}

function lastResponse(socket: ReturnType<typeof buildSocket>) {
  const calls = socket.emit.mock.calls;
  return calls[calls.length - 1][1];
}

describe("DraftGateway", () => {
  let wsAuth: jest.Mocked<WsAuthService>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let gateway: DraftGateway;
  let roomEmit: jest.Mock;
  let roomSockets: ReturnType<typeof buildSocket>[];

  beforeEach(() => {
    wsAuth = {
      subjectOf: jest.fn(async (token: unknown) =>
        typeof token === "string" ? token : null,
      ),
    } as unknown as jest.Mocked<WsAuthService>;
    tournamentRepo = {
      findBySlugAnyLeague: jest.fn().mockResolvedValue(buildTournament()),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    coachRepo = {
      findByAuth0Id: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;

    gateway = new DraftGateway(wsAuth, tournamentRepo, coachRepo, teamRepo);
    roomEmit = jest.fn();
    roomSockets = [];
    gateway.server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      in: jest.fn(() => ({ fetchSockets: async () => roomSockets })),
    } as never;
  });

  async function subscribe(socket: ReturnType<typeof buildSocket>) {
    gateway.handleConnection(socket as never);
    await gateway.handleMessage(socket as never, {
      jsonrpc: "2.0",
      method: "league.subscribe",
      params: { tournamentSlug: TOURNAMENT_SLUG },
      id: 1,
    });
    roomSockets.push(socket);
    return socket;
  }

  function privateEvent() {
    return {
      tournamentSlug: TOURNAMENT_SLUG,
      draftSlug: "pool-a",
      audience: { draftPublic: false },
      draftName: "Pool A",
    };
  }

  it("verifies the handshake token and joins the tournament room", async () => {
    const socket = await subscribe(buildSocket("auth0|owner"));

    expect(wsAuth.subjectOf).toHaveBeenCalledWith("auth0|owner");
    expect(socket.join).toHaveBeenCalledWith(TOURNAMENT_SLUG);
    expect(lastResponse(socket)).toMatchObject({
      result: { subscribed: TOURNAMENT_SLUG },
    });
  });

  it("refuses a room name that is not a slug", async () => {
    const socket = buildSocket();
    gateway.handleConnection(socket as never);

    await gateway.handleMessage(socket as never, {
      jsonrpc: "2.0",
      method: "league.subscribe",
      params: { tournamentSlug: "not a slug!" },
      id: 1,
    });

    expect(socket.join).not.toHaveBeenCalled();
    expect(lastResponse(socket).error.code).toBe(-32602);
  });

  it("refuses a tournament that does not exist", async () => {
    tournamentRepo.findBySlugAnyLeague.mockResolvedValue(null);
    const socket = buildSocket();
    gateway.handleConnection(socket as never);

    await gateway.handleMessage(socket as never, {
      jsonrpc: "2.0",
      method: "league.subscribe",
      params: { tournamentSlug: "missing" },
      id: 1,
    });

    expect(socket.join).not.toHaveBeenCalled();
    expect(lastResponse(socket).error.message).toBe("Tournament not found");
  });

  it("sends a public draft's events to the whole room, without the audience", async () => {
    await gateway.onDraftCompleted({
      ...privateEvent(),
      audience: { draftPublic: true },
    });

    expect(gateway.server.to).toHaveBeenCalledWith(TOURNAMENT_SLUG);
    const sent = roomEmit.mock.calls[0][1];
    expect(sent.event).toBe("league.draft.completed");
    expect(sent.data).not.toHaveProperty("audience");
  });

  it("sends a private draft's events only to staff and approved coaches", async () => {
    const anonymous = await subscribe(buildSocket());
    const stranger = await subscribe(buildSocket("auth0|stranger"));
    const owner = await subscribe(buildSocket("auth0|owner"));
    coachRepo.findByAuth0Id.mockResolvedValue([
      { teamId: new Types.ObjectId() } as never,
    ]);
    teamRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        tournamentId: { toString: () => TOURNAMENT_ID },
        status: "approved",
      } as never,
    ]);
    const coach = await subscribe(buildSocket("auth0|coach"));

    await gateway.onDraftCompleted(privateEvent());

    const received = (socket: ReturnType<typeof buildSocket>) =>
      socket.emit.mock.calls.some(
        ([, message]) => message.event === "league.draft.completed",
      );
    expect(received(anonymous)).toBe(false);
    expect(received(stranger)).toBe(false);
    expect(received(owner)).toBe(true);
    expect(received(coach)).toBe(true);
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it("does not count a pending or dropped team as membership", async () => {
    coachRepo.findByAuth0Id.mockResolvedValue([
      { teamId: new Types.ObjectId() } as never,
    ]);
    teamRepo.findManyByIds.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        tournamentId: { toString: () => TOURNAMENT_ID },
        status: "dropped",
      } as never,
    ]);
    const dropped = await subscribe(buildSocket("auth0|dropped"));

    await gateway.onDraftCompleted(privateEvent());

    expect(
      dropped.emit.mock.calls.some(
        ([, message]) => message.event === "league.draft.completed",
      ),
    ).toBe(false);
  });

  describe("blind drafts", () => {
    const blindTeamId = new Types.ObjectId();

    function pickEvent() {
      return {
        tournamentSlug: TOURNAMENT_SLUG,
        draftSlug: "pool-a",
        audience: { draftPublic: true, blindTeamId: blindTeamId.toString() },
        pick: { team: "Team A", draft: "pool-a", pokemon: { id: "pikachu" } },
        team: { id: blindTeamId.toString(), name: "Team A", draft: [{ id: "pikachu" }] },
        pokemon: { id: "pikachu" },
      } as never;
    }

    function addedFor(socket: ReturnType<typeof buildSocket>) {
      return socket.emit.mock.calls.find(
        ([, message]) => message.event === "league.draft.added",
      )?.[1].data;
    }

    async function subscribeCoachOf(teamId: Types.ObjectId, sub: string) {
      coachRepo.findByAuth0Id.mockResolvedValueOnce([
        { teamId } as never,
      ]);
      teamRepo.findManyByIds.mockResolvedValueOnce([
        {
          _id: teamId,
          tournamentId: { toString: () => TOURNAMENT_ID },
          status: "approved",
        } as never,
      ]);
      return subscribe(buildSocket(sub));
    }

    it("hides the pick from everyone but the picking team and staff", async () => {
      const anonymous = await subscribe(buildSocket());
      const rival = await subscribeCoachOf(new Types.ObjectId(), "auth0|rival");
      const picker = await subscribeCoachOf(blindTeamId, "auth0|picker");
      const owner = await subscribe(buildSocket("auth0|owner"));

      await gateway.onDraftAdded(pickEvent());

      for (const viewer of [anonymous, rival]) {
        const data = addedFor(viewer);
        expect(data.pokemon).toBeUndefined();
        expect(data.pick).toEqual({ team: "Team A", draft: "pool-a" });
        expect(data.team.draft).toEqual([]);
      }
      for (const viewer of [picker, owner]) {
        expect(addedFor(viewer).pokemon).toEqual({ id: "pikachu" });
        expect(addedFor(viewer).team.draft).toEqual([{ id: "pikachu" }]);
      }
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it("sends unredacted status events in a blind draft", async () => {
      const anonymous = await subscribe(buildSocket());

      await gateway.onDraftCompleted({
        ...privateEvent(),
        audience: { draftPublic: true, blindTeamId: blindTeamId.toString() },
      });

      const sent = anonymous.emit.mock.calls.find(
        ([, message]) => message.event === "league.draft.completed",
      )?.[1];
      expect(sent.data.draftName).toBe("Pool A");
    });
  });
});
