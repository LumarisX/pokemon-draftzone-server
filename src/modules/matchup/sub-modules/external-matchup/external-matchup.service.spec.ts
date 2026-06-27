import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ExternalTournament } from "@modules/tournament/sub-modules/external-tournament/external-tournament.domain";
import { ExternalTournamentRepository } from "@modules/tournament/sub-modules/external-tournament/external-tournament.repository";
import { Types } from "mongoose";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchup } from "./external-matchup.domain";
import { ExternalMatchupDto, ScorePatchDto, SchedulePatchDto } from "./external-matchup.dto";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import { ExternalMatchupRepository } from "./external-matchup.repository";
import { ExternalMatchupService } from "./external-matchup.service";

jest.mock("@modules/pokemon/pokemon.mapper", () => ({
  PokemonMapper: {
    fromForm: jest.fn(),
    toDatabasePayload: jest.fn(),
  },
}));
jest.mock("./external-matchup.mapper", () => ({
  ExternalMatchupMapper: {
    fromForm: jest.fn(),
    toDatabasePayload: jest.fn(),
  },
}));
jest.mock("./external-matchup-match/external-matchup-match.mapper", () => ({
  MatchMapper: {
    fromForm: jest.fn(),
  },
}));

const mockedPokemonMapper = PokemonMapper as jest.Mocked<
  typeof PokemonMapper
>;
const mockedExternalMatchupMapper = ExternalMatchupMapper as jest.Mocked<
  typeof ExternalMatchupMapper
>;
const mockedMatchMapper = MatchMapper as jest.Mocked<typeof MatchMapper>;

function buildTournament(overrides: Partial<ExternalTournament> = {}) {
  return {
    _id: new Types.ObjectId(),
    ruleset: { name: "Gen9 NatDex" },
    format: { name: "Singles" },
    leagueName: "Spring League",
    teamName: "Team Rocket",
    key: "springleague",
    owner: "auth0|owner",
    team: [],
    matchups: [],
    ...overrides,
  } as unknown as ExternalTournament;
}

function buildSingleMatch(aScore: number, bScore: number) {
  return { aTeam: { score: aScore }, bTeam: { score: bScore } } as any;
}

function buildSeriesMatch(winner?: "a" | "b") {
  return { winner } as any;
}

describe("ExternalMatchupService", () => {
  let matchupRepo: jest.Mocked<ExternalMatchupRepository>;
  let tournamentRepo: jest.Mocked<ExternalTournamentRepository>;
  let service: ExternalMatchupService;

  beforeEach(() => {
    matchupRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTournamentId: jest.fn(),
      update: jest.fn(),
      updateScore: jest.fn(),
    } as unknown as jest.Mocked<ExternalMatchupRepository>;
    tournamentRepo = {
      findByKeyAndOwner: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentRepository>;

    service = new ExternalMatchupService(matchupRepo, tournamentRepo);
  });

  describe("getScore", () => {
    it("returns wins 0, losses 0, diff +0 when there are no matchups", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findByTournamentId.mockResolvedValue([]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(matchupRepo.findByTournamentId).toHaveBeenCalledWith(
        tournament._id,
      );
      expect(result).toEqual({ wins: 0, losses: 0, diff: "+0" });
    });

    it("skips matchups with no matches", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        { matches: [] } as unknown as ExternalMatchup,
        { matches: undefined } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result).toEqual({ wins: 0, losses: 0, diff: "+0" });
    });

    it("scores a single-game matchup by comparing aTeam/bTeam scores", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        { matches: [buildSingleMatch(3, 1)] } as unknown as ExternalMatchup,
        { matches: [buildSingleMatch(0, 2)] } as unknown as ExternalMatchup,
        { matches: [buildSingleMatch(1, 1)] } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result).toEqual({ wins: 1, losses: 1, diff: "+0" });
    });

    it("defaults missing single-game scores to 0", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        {
          matches: [{ aTeam: undefined, bTeam: undefined } as any],
        } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result).toEqual({ wins: 0, losses: 0, diff: "+0" });
    });

    it("scores a best-of series by majority of per-game winners", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        {
          matches: [
            buildSeriesMatch("a"),
            buildSeriesMatch("a"),
            buildSeriesMatch("b"),
          ],
        } as unknown as ExternalMatchup,
        {
          matches: [
            buildSeriesMatch("b"),
            buildSeriesMatch("b"),
            buildSeriesMatch("a"),
          ],
        } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result).toEqual({ wins: 1, losses: 1, diff: "+0" });
    });

    it("doesn't credit a win or loss when a series is tied", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        {
          matches: [buildSeriesMatch("a"), buildSeriesMatch("b")],
        } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result).toEqual({ wins: 0, losses: 0, diff: "+0" });
    });

    it("formats a negative net diff without a leading plus", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(buildTournament());
      matchupRepo.findByTournamentId.mockResolvedValue([
        { matches: [buildSingleMatch(0, 4)] } as unknown as ExternalMatchup,
      ]);

      const result = await service.getScore("springleague", "auth0|owner");

      expect(result.diff).toBe("-4");
    });
  });

  describe("getExternalMatchups", () => {
    it("returns the tournament's matchups", async () => {
      const matchups = [{ stage: "Round 1" }] as unknown as ExternalMatchup[];
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups }),
      );

      const result = await service.getExternalMatchups(
        "springleague",
        "auth0|owner",
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(result).toBe(matchups);
    });
  });

  describe("createExternalMatchup", () => {
    function buildDto(overrides: Partial<ExternalMatchupDto> = {}): ExternalMatchupDto {
      return {
        stage: "Round 1",
        teamName: "Challenger",
        coach: "challenger-coach",
        matches: [],
        team: [],
        ...overrides,
      } as ExternalMatchupDto;
    }

    it("throws when the tournament has no _id", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ _id: undefined }),
      );

      await expect(
        service.createExternalMatchup("springleague", "auth0|owner", buildDto()),
      ).rejects.toMatchObject({ code: "DR-005" });
      expect(matchupRepo.create).not.toHaveBeenCalled();
    });

    it("filters out team entries without an id and maps the rest with the tournament's ruleset", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      mockedPokemonMapper.fromForm.mockImplementation(
        (p: any) => ({ id: p.id, fromForm: true }) as any,
      );
      mockedPokemonMapper.toDatabasePayload.mockImplementation(
        (p: any) => ({ id: p.id, toDatabasePayload: true }) as any,
      );
      const dto = buildDto({
        team: [{ id: "" } as any, { id: "pikachu" } as any],
      });

      await service.createExternalMatchup("springleague", "auth0|owner", dto);

      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledTimes(1);
      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledWith(
        dto.team[1],
        tournament.ruleset,
      );
      expect(matchupRepo.create).toHaveBeenCalledWith({
        aTeam: { _id: tournament._id },
        bTeam: {
          teamName: "Challenger",
          coach: "challenger-coach",
          team: [{ id: "pikachu", toDatabasePayload: true }],
        },
        stage: "Round 1",
        matches: [],
      });
    });

    it("defaults coach to undefined when not provided", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      const dto = buildDto({ coach: undefined, team: [] });

      await service.createExternalMatchup("springleague", "auth0|owner", dto);

      const payload = matchupRepo.create.mock.calls[0][0];
      expect(payload.bTeam.coach).toBeUndefined();
    });
  });

  describe("getExternalMatchup", () => {
    it("returns the matchup when it belongs to the caller's tournament", async () => {
      const tournament = buildTournament();
      const matchup = {
        stage: "Round 1",
        aTeam: { id: tournament._id },
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue(matchup);

      const result = await service.getExternalMatchup(
        "springleague",
        "matchup-1",
        "auth0|owner",
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(matchupRepo.findById).toHaveBeenCalledWith("matchup-1");
      expect(result).toBe(matchup);
    });

    it("rejects when the matchup belongs to a different tournament than the caller's", async () => {
      const tournament = buildTournament();
      const matchup = {
        stage: "Round 1",
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue(matchup);

      await expect(
        service.getExternalMatchup("springleague", "matchup-1", "auth0|owner"),
      ).rejects.toMatchObject({ code: "MU-001" });
    });
  });

  describe("getExternalMatchupOpponent", () => {
    it("returns the matchup when it belongs to the caller's tournament", async () => {
      const tournament = buildTournament();
      const matchup = {
        stage: "Round 1",
        aTeam: { id: tournament._id },
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue(matchup);

      const result = await service.getExternalMatchupOpponent(
        "springleague",
        "matchup-1",
        "auth0|owner",
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(matchupRepo.findById).toHaveBeenCalledWith("matchup-1");
      expect(result).toBe(matchup);
    });

    it("rejects when the matchup belongs to a different tournament than the one owned by the caller", async () => {
      const tournament = buildTournament();
      const matchup = {
        stage: "Round 1",
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue(matchup);

      await expect(
        service.getExternalMatchupOpponent(
          "springleague",
          "matchup-1",
          "auth0|owner",
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
    });

    it("propagates the not-found error when the caller doesn't own that tournament key", async () => {
      tournamentRepo.findByKeyAndOwner.mockRejectedValue(
        new Error("tournament not found"),
      );

      await expect(
        service.getExternalMatchupOpponent(
          "springleague",
          "matchup-1",
          "auth0|stranger",
        ),
      ).rejects.toThrow("tournament not found");
      expect(matchupRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe("updateExternalMatchupOpponent", () => {
    it("merges the form data onto the owned matchup and persists it", async () => {
      const tournament = buildTournament();
      const existing = {
        stage: "Round 1",
        aTeam: { id: tournament._id },
      } as unknown as ExternalMatchup;
      const updated = { stage: "Round 1", teamName: "Updated" } as unknown as ExternalMatchup;
      const refetched = { stage: "Round 1", teamName: "Updated", refetched: true } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(refetched);
      mockedExternalMatchupMapper.fromForm.mockReturnValue(updated);
      mockedExternalMatchupMapper.toDatabasePayload.mockReturnValue({
        persisted: true,
      } as any);
      const dto = { teamName: "Updated" } as ExternalMatchupDto;

      const result = await service.updateExternalMatchupOpponent(
        "springleague",
        "matchup-1",
        "auth0|owner",
        dto,
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(mockedExternalMatchupMapper.fromForm).toHaveBeenCalledWith(
        dto,
        existing,
      );
      expect(mockedExternalMatchupMapper.toDatabasePayload).toHaveBeenCalledWith(
        updated,
      );
      expect(matchupRepo.update).toHaveBeenCalledWith("matchup-1", {
        persisted: true,
      });
      expect(result).toBe(refetched);
    });

    it("rejects and does not write when the matchup is owned by a different tournament", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        stage: "Round 1",
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup);

      await expect(
        service.updateExternalMatchupOpponent(
          "springleague",
          "matchup-1",
          "auth0|stranger",
          { teamName: "Updated" } as ExternalMatchupDto,
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
      expect(matchupRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("updateExternalMatchupScore", () => {
    it("verifies ownership, maps the form matches, and forwards both team pastes to the repository", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: tournament._id },
      } as unknown as ExternalMatchup);
      mockedMatchMapper.fromForm.mockImplementation(
        (m: any) => ({ mapped: m }) as any,
      );
      const dto: ScorePatchDto = {
        aTeamPaste: "a-paste",
        bTeamPaste: "b-paste",
        matches: [{ winner: "a" } as any],
      };

      await service.updateExternalMatchupScore(
        "springleague",
        "matchup-1",
        "auth0|owner",
        dto,
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(matchupRepo.updateScore).toHaveBeenCalledWith(
        "matchup-1",
        [{ mapped: dto.matches[0] }],
        "a-paste",
        "b-paste",
      );
    });

    it("rejects and does not write when the matchup is owned by a different tournament", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup);
      const dto: ScorePatchDto = { matches: [] };

      await expect(
        service.updateExternalMatchupScore(
          "springleague",
          "matchup-1",
          "auth0|stranger",
          dto,
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
      expect(matchupRepo.updateScore).not.toHaveBeenCalled();
    });
  });

  describe("getExternalMatchupSchedule", () => {
    function mockOwnedMatchup(matchup: Partial<ExternalMatchup>) {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: tournament._id },
        ...matchup,
      } as unknown as ExternalMatchup);
    }

    it("returns the stored game time and reminder lead time for an owned matchup", async () => {
      const gameTime = new Date("2026-02-01");
      mockOwnedMatchup({ gameTime, reminder: 60 });

      const result = await service.getExternalMatchupSchedule(
        "springleague",
        "matchup-1",
        "auth0|owner",
      );

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(result).toEqual({ gameTime, reminder: 60 });
    });

    it("returns an undefined reminder when none was set", async () => {
      mockOwnedMatchup({ gameTime: undefined, reminder: undefined });

      const result = await service.getExternalMatchupSchedule(
        "springleague",
        "matchup-1",
        "auth0|owner",
      );

      expect(result).toEqual({ gameTime: undefined, reminder: undefined });
    });

    it("rejects when the matchup belongs to a different tournament", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup);

      await expect(
        service.getExternalMatchupSchedule(
          "springleague",
          "matchup-1",
          "auth0|stranger",
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
    });
  });

  describe("updateExternalMatchupSchedule", () => {
    it("persists the new date/time and reminder lead time for an owned matchup", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: tournament._id },
      } as unknown as ExternalMatchup);
      const dto: SchedulePatchDto = { dateTime: "2026-02-01T00:00:00Z", emailTime: 60 };

      await service.updateExternalMatchupSchedule(
        "springleague",
        "matchup-1",
        "auth0|owner",
        dto,
      );

      expect(matchupRepo.update).toHaveBeenCalledWith("matchup-1", {
        gameTime: dto.dateTime,
        reminder: dto.emailTime,
      });
    });

    it("rejects and does not write when the matchup is owned by a different tournament", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);
      matchupRepo.findById.mockResolvedValue({
        aTeam: { id: new Types.ObjectId() },
      } as unknown as ExternalMatchup);

      await expect(
        service.updateExternalMatchupSchedule(
          "springleague",
          "matchup-1",
          "auth0|stranger",
          { dateTime: "2026-02-01T00:00:00Z" } as SchedulePatchDto,
        ),
      ).rejects.toMatchObject({ code: "MU-001" });
      expect(matchupRepo.update).not.toHaveBeenCalled();
    });
  });
});
