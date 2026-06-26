import { PokemonService } from "@modules/pokemon/pokemon.service";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentRepository } from "./external-tournament.repository";
import { ExternalTournamentService } from "./external-tournament.service";

function buildTournament(overrides: Partial<ExternalTournament> = {}) {
  return {
    _id: undefined,
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

function buildMatch(
  aTeamStats: [string, Partial<{ kills: number; brought: number; indirect: number; deaths: number }>][],
) {
  return {
    aTeam: { stats: aTeamStats, score: 0 },
    bTeam: { stats: [], score: 0 },
  };
}

describe("ExternalTournamentService", () => {
  let tournamentRepo: jest.Mocked<ExternalTournamentRepository>;
  let pokedexService: jest.Mocked<PokemonService>;
  let service: ExternalTournamentService;

  beforeEach(() => {
    tournamentRepo = {
      findByOwner: jest.fn(),
      findByKeyAndOwner: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateByKeyAndOwner: jest.fn(),
      deleteByKeyAndOwner: jest.fn(),
    } as unknown as jest.Mocked<ExternalTournamentRepository>;
    pokedexService = {
      getName: jest.fn().mockReturnValue("Pikachu"),
    } as unknown as jest.Mocked<PokemonService>;

    service = new ExternalTournamentService(tournamentRepo, pokedexService);
  });

  describe("getTournaments", () => {
    it("returns the tournaments owned by the given sub", async () => {
      const tournaments = [buildTournament()];
      tournamentRepo.findByOwner.mockResolvedValue(tournaments);

      const result = await service.getTournaments("auth0|owner");

      expect(tournamentRepo.findByOwner).toHaveBeenCalledWith("auth0|owner");
      expect(result).toBe(tournaments);
    });
  });

  describe("getTournament", () => {
    it("looks up the tournament by key and owner", async () => {
      const tournament = buildTournament();
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(tournament);

      const result = await service.getTournament("springleague", "auth0|owner");

      expect(tournamentRepo.findByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
      );
      expect(result).toBe(tournament);
    });
  });

  describe("createTournament", () => {
    it("delegates to the repository", async () => {
      const tournament = buildTournament();

      await service.createTournament(tournament);

      expect(tournamentRepo.create).toHaveBeenCalledWith(tournament);
    });
  });

  describe("updateTournament", () => {
    it("delegates to the repository with the key, owner, and tournament", async () => {
      const tournament = buildTournament();

      await service.updateTournament("springleague", "auth0|owner", tournament);

      expect(tournamentRepo.updateByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
        tournament,
      );
    });
  });

  describe("deleteTournament", () => {
    it("delegates to the repository without a session", async () => {
      await service.deleteTournament("springleague", "auth0|owner");

      expect(tournamentRepo.deleteByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
        undefined,
      );
    });

    it("forwards a session when provided", async () => {
      const session = { id: "session-1" } as any;

      await service.deleteTournament("springleague", "auth0|owner", session);

      expect(tournamentRepo.deleteByKeyAndOwner).toHaveBeenCalledWith(
        "springleague",
        "auth0|owner",
        session,
      );
    });
  });

  describe("getTournamentStats", () => {
    it("returns an empty pokemon list when there are no matchups", async () => {
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result).toEqual({ pokemon: [] });
    });

    it("skips matchups whose matches aren't an array", async () => {
      const matchup = {
        matches: undefined,
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchup] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result).toEqual({ pokemon: [] });
    });

    it("aggregates kills, deaths, brought, and indirect across games and matchups for the same Pokemon", async () => {
      const matchupOne = {
        matches: [
          buildMatch([["pikachu", { kills: 2, brought: 1, deaths: 0 }]]),
          buildMatch([["pikachu", { kills: 1, indirect: 1, brought: 1, deaths: 1 }]]),
        ],
      } as unknown as ExternalMatchup;
      const matchupTwo = {
        matches: [buildMatch([["pikachu", { kills: 0, brought: 1, deaths: 1 }]])],
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchupOne, matchupTwo] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result.pokemon).toHaveLength(1);
      expect(result.pokemon[0]).toMatchObject({
        pokemon: { id: "pikachu", name: "Pikachu" },
        kills: 3,
        brought: 3,
        indirect: 1,
        deaths: 2,
      });
      expect(pokedexService.getName).toHaveBeenCalledWith("pikachu");
    });

    it("computes kdr as kills plus indirect minus deaths", async () => {
      const matchup = {
        matches: [
          buildMatch([["pikachu", { kills: 5, indirect: 2, brought: 3, deaths: 3 }]]),
        ],
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchup] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result.pokemon[0].kdr).toBe(4);
    });

    it("computes kpg as (kills + indirect) / brought", async () => {
      const matchup = {
        matches: [
          buildMatch([["pikachu", { kills: 4, indirect: 2, brought: 3, deaths: 0 }]]),
        ],
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchup] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result.pokemon[0].kpg).toBeCloseTo(2);
    });

    it("falls back to a kpg of 0 when the Pokemon was never brought", async () => {
      const matchup = {
        matches: [
          buildMatch([["pikachu", { kills: 0, brought: 0, deaths: 0 }]]),
        ],
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchup] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      expect(result.pokemon[0].kpg).toBe(0);
    });

    it("tracks stats for multiple distinct Pokemon independently", async () => {
      const matchup = {
        matches: [
          buildMatch([
            ["pikachu", { kills: 2, brought: 1, deaths: 0 }],
            ["charizard", { kills: 1, brought: 1, deaths: 1 }],
          ]),
        ],
      } as unknown as ExternalMatchup;
      tournamentRepo.findByKeyAndOwner.mockResolvedValue(
        buildTournament({ matchups: [matchup] }),
      );

      const result = await service.getTournamentStats(
        "springleague",
        "auth0|owner",
      );

      const ids = result.pokemon.map((p) => p.pokemon.id);
      expect(ids).toEqual(
        expect.arrayContaining(["pikachu", "charizard"]),
      );
      expect(result.pokemon).toHaveLength(2);
    });
  });
});
