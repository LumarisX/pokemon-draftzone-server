import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueRepository } from "@modules/league/league.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { Types } from "mongoose";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";

function query<T>(result: T) {
  const chain: any = {
    sort: () => chain,
    select: () => chain,
    lean: () => chain,
    exec: () => Promise.resolve(result),
  };
  return chain;
}

function stage(id: Types.ObjectId) {
  return { _id: id, name: `stage-${id.toString().slice(-4)}` };
}

function tournamentDoc(stages: Types.ObjectId[], league = new Types.ObjectId()) {
  return { _id: new Types.ObjectId(), league, stages, tierList: undefined };
}

describe("HostedTournamentRepository", () => {
  let tournamentModel: { findOne: jest.Mock; find: jest.Mock };
  let stageRepo: jest.Mocked<StageRepository>;
  let leagueRepo: jest.Mocked<LeagueRepository>;
  let repo: HostedTournamentRepository;
  let fromDatabase: jest.SpyInstance;

  beforeEach(() => {
    tournamentModel = { findOne: jest.fn(), find: jest.fn() };
    stageRepo = {
      findManyByIds: jest.fn(async (ids: string[]) =>
        [...ids].reverse().map((id) => stage(new Types.ObjectId(id))),
      ),
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<StageRepository>;
    leagueRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<LeagueRepository>;
    repo = new HostedTournamentRepository(
      tournamentModel as any,
      { find: jest.fn(() => query([])), findById: jest.fn(() => query(null)) } as any,
      stageRepo,
      leagueRepo,
      {
        findByAuth0Id: jest.fn().mockResolvedValue([{ teamId: "team-1" }]),
      } as unknown as CoachRepository,
      {
        findManyByIds: jest.fn(),
      } as unknown as TeamRepository,
    );
    fromDatabase = jest
      .spyOn(HostedTournamentMapper, "fromDatabase")
      .mockImplementation((doc, league, stages) => ({ doc, league, stages }) as any);
  });

  afterEach(() => fromDatabase.mockRestore());

  describe("findBySlug", () => {
    it("matches the slug with $eq and loads every stage in one query, in the tournament's order", async () => {
      const league = { _id: new Types.ObjectId() };
      leagueRepo.findBySlug.mockResolvedValue(league as any);
      const [first, second, third] = [0, 1, 2].map(() => new Types.ObjectId());
      tournamentModel.findOne.mockReturnValue(
        query(tournamentDoc([first, second, third], league._id)),
      );

      await repo.findBySlug("spring", "spring-cup");

      expect(tournamentModel.findOne).toHaveBeenCalledWith({
        slug: { $eq: "spring-cup" },
        league: league._id,
      });
      expect(stageRepo.findManyByIds).toHaveBeenCalledTimes(1);
      expect(stageRepo.findByIdOrNull).not.toHaveBeenCalled();
      const stages = fromDatabase.mock.calls[0][2];
      expect(stages.map((s: any) => s._id)).toEqual([first, second, third]);
    });

    it("skips stage ids that no longer exist", async () => {
      leagueRepo.findBySlug.mockResolvedValue({ _id: new Types.ObjectId() } as any);
      const kept = new Types.ObjectId();
      const deleted = new Types.ObjectId();
      tournamentModel.findOne.mockReturnValue(query(tournamentDoc([kept, deleted])));
      stageRepo.findManyByIds.mockResolvedValue([stage(kept)] as any);

      await repo.findBySlug("spring", "spring-cup");

      expect(fromDatabase.mock.calls[0][2].map((s: any) => s._id)).toEqual([kept]);
    });

    it("makes no stage query for a tournament without stages", async () => {
      leagueRepo.findBySlug.mockResolvedValue({ _id: new Types.ObjectId() } as any);
      tournamentModel.findOne.mockReturnValue(query(tournamentDoc([])));

      await repo.findBySlug("spring", "spring-cup");

      expect(stageRepo.findManyByIds).not.toHaveBeenCalled();
      expect(fromDatabase.mock.calls[0][2]).toEqual([]);
    });
  });

  describe("findAllByLeague", () => {
    it("loads the stages of every tournament in one query", async () => {
      const a = [new Types.ObjectId(), new Types.ObjectId()];
      const b = [new Types.ObjectId()];
      tournamentModel.find.mockReturnValue(
        query([tournamentDoc(a), tournamentDoc(b)]),
      );

      await repo.findAllByLeague({ _id: new Types.ObjectId() } as any);

      expect(stageRepo.findManyByIds).toHaveBeenCalledTimes(1);
      expect(fromDatabase.mock.calls[0][2].map((s: any) => s._id)).toEqual(a);
      expect(fromDatabase.mock.calls[1][2].map((s: any) => s._id)).toEqual(b);
    });
  });

  describe("findByParticipant", () => {
    it("loads each league once, in one query", async () => {
      const leagueId = new Types.ObjectId();
      const teamRepo = (repo as any).teamRepo as jest.Mocked<TeamRepository>;
      teamRepo.findManyByIds.mockResolvedValue([
        { tournamentId: new Types.ObjectId() },
        { tournamentId: new Types.ObjectId() },
      ] as any);
      tournamentModel.find.mockReturnValue(
        query([tournamentDoc([], leagueId), tournamentDoc([], leagueId)]),
      );
      leagueRepo.findManyByIds.mockResolvedValue([{ _id: leagueId }] as any);

      const result = await repo.findByParticipant("auth0|coach");

      expect(leagueRepo.findManyByIds).toHaveBeenCalledWith([
        leagueId.toString(),
      ]);
      expect(leagueRepo.findById).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("leaves out a tournament whose league is gone instead of failing", async () => {
      const teamRepo = (repo as any).teamRepo as jest.Mocked<TeamRepository>;
      teamRepo.findManyByIds.mockResolvedValue([
        { tournamentId: new Types.ObjectId() },
      ] as any);
      tournamentModel.find.mockReturnValue(query([tournamentDoc([])]));
      leagueRepo.findManyByIds.mockResolvedValue([]);

      await expect(repo.findByParticipant("auth0|coach")).resolves.toEqual([]);
    });
  });

  describe("findRulesBySlug", () => {
    it("reads only the rules, with no stage or tier-list lookups", async () => {
      leagueRepo.findBySlug.mockResolvedValue({ _id: new Types.ObjectId() } as any);
      tournamentModel.findOne.mockReturnValue(
        query({ rules: [{ title: "Bans", body: "No Ubers" }] }),
      );

      const rules = await repo.findRulesBySlug("spring", "spring-cup");

      expect(tournamentModel.findOne.mock.calls[0][1]).toEqual({ rules: 1 });
      expect(rules).toEqual([
        expect.objectContaining({ title: "Bans", body: "No Ubers" }),
      ]);
      expect(stageRepo.findManyByIds).not.toHaveBeenCalled();
      expect(fromDatabase).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND for an unknown tournament", async () => {
      leagueRepo.findBySlug.mockResolvedValue({ _id: new Types.ObjectId() } as any);
      tournamentModel.findOne.mockReturnValue(query(null));

      await expect(
        repo.findRulesBySlug("spring", "missing"),
      ).rejects.toMatchObject({ code: "TRN-006" });
    });
  });
});
