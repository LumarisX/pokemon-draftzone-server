import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentDto } from "./external-tournament.dto";
import { ExternalTournamentMapper } from "./external-tournament.mapper";
import { ExternalTournamentDocument } from "./external-tournament.schema";

jest.mock("@core/data/formats/formats", () => ({
  getFormat: jest.fn(),
}));
jest.mock("@core/data/rulesets/rulesets", () => ({
  getRuleset: jest.fn(),
}));
jest.mock("@modules/pokemon/pokemon.mapper", () => ({
  PokemonMapper: {
    fromForm: jest.fn(),
    fromDatabase: jest.fn(),
    toDatabasePayload: jest.fn(),
    toClientPayload: jest.fn(),
  },
}));

const mockedGetFormat = getFormat as jest.Mock;
const mockedGetRuleset = getRuleset as jest.Mock;
const mockedPokemonMapper = PokemonMapper as jest.Mocked<
  typeof PokemonMapper
>;

const RULESET = { name: "Gen9 NatDex" } as any;
const FORMAT = { name: "Singles", level: 100, choose: 6, layout: "1" } as any;

function buildTournament(overrides: Partial<ConstructorParameters<typeof ExternalTournament>[0]> = {}) {
  return new ExternalTournament(
    {
      ruleset: RULESET,
      format: FORMAT,
      leagueName: "Spring League",
      teamName: "Team Rocket",
      key: "springleague",
      owner: "auth0|owner",
      team: [],
      doc: "doc-key",
      ...overrides,
    },
    [],
  );
}

describe("ExternalTournamentMapper", () => {
  beforeEach(() => {
    mockedGetFormat.mockReturnValue(FORMAT);
    mockedGetRuleset.mockReturnValue(RULESET);
    mockedPokemonMapper.fromForm.mockImplementation(
      (pokemon: any) => ({ id: pokemon.id, fromForm: true }) as any,
    );
    mockedPokemonMapper.fromDatabase.mockImplementation(
      (pokemon: any) => ({ id: pokemon.id, fromDatabase: true }) as any,
    );
    mockedPokemonMapper.toDatabasePayload.mockImplementation(
      (pokemon: any) => ({ id: pokemon.id, toDatabasePayload: true }) as any,
    );
    mockedPokemonMapper.toClientPayload.mockImplementation(
      (pokemon: any) => ({ id: pokemon.id, toClientPayload: true }) as any,
    );
  });

  describe("toDatabasePayload", () => {
    it("maps tournament fields, using the format and ruleset names", () => {
      const pokemon = [{ id: "pikachu" }] as any;
      const tournament = buildTournament({ team: pokemon });

      const result = ExternalTournamentMapper.toDatabasePayload(tournament);

      expect(result).toEqual({
        leagueName: "Spring League",
        leagueId: "springleague",
        teamName: "Team Rocket",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        owner: "auth0|owner",
        doc: "doc-key",
        team: [{ id: "pikachu", toDatabasePayload: true }],
      });
      expect(
        mockedPokemonMapper.toDatabasePayload.mock.calls[0][0],
      ).toBe(pokemon[0]);
    });
  });

  describe("toClientPayload", () => {
    it("maps tournament fields for the client, keyed by the tournament's key", () => {
      const pokemon = [{ id: "charizard" }] as any;
      const tournament = buildTournament({
        _id: "abc123" as any,
        team: pokemon,
      });
      tournament._id = { toString: () => "abc123" } as any;

      const result = ExternalTournamentMapper.toClientPayload(tournament);

      expect(result).toEqual({
        id: "abc123",
        leagueName: "Spring League",
        tournamentId: "springleague",
        teamName: "Team Rocket",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        doc: "doc-key",
        score: { wins: 0, losses: 0, diff: "+0" },
        team: [{ id: "charizard", toClientPayload: true }],
      });
    });

    it("returns an undefined id when the tournament has no _id yet", () => {
      const tournament = buildTournament();

      const result = ExternalTournamentMapper.toClientPayload(tournament);

      expect(result.id).toBeUndefined();
    });
  });

  describe("fromForm", () => {
    function buildDto(overrides: Partial<ExternalTournamentDto> = {}): ExternalTournamentDto {
      return {
        leagueName: "Spring League",
        teamName: "Team Rocket",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        team: [],
        ...overrides,
      } as ExternalTournamentDto;
    }

    it("derives the tournament key by lowercasing the league name and stripping non-word characters", () => {
      const dto = buildDto({ leagueName: " Spring's League! 2026 " });

      const result = ExternalTournamentMapper.fromForm(dto, "auth0|owner");

      expect(result.key).toBe("springsleague2026");
    });

    it("trims teamName, leagueName, and doc", () => {
      const dto = buildDto({
        leagueName: "  Spring League  ",
        teamName: "  Team Rocket  ",
        doc: "  doc-key  ",
      });

      const result = ExternalTournamentMapper.fromForm(dto, "auth0|owner");

      expect(result.leagueName).toBe("Spring League");
      expect(result.teamName).toBe("Team Rocket");
      expect(result.doc).toBe("doc-key");
    });

    it("leaves doc undefined when it isn't provided", () => {
      const dto = buildDto({ doc: undefined });

      const result = ExternalTournamentMapper.fromForm(dto, "auth0|owner");

      expect(result.doc).toBeUndefined();
    });

    it("resolves the format and ruleset from their ids", () => {
      const dto = buildDto({ format: "VGC", ruleset: "Paldea Dex" });

      ExternalTournamentMapper.fromForm(dto, "auth0|owner");

      expect(mockedGetFormat).toHaveBeenCalledWith("VGC");
      expect(mockedGetRuleset).toHaveBeenCalledWith("Paldea Dex");
    });

    it("filters out team entries without an id and maps the rest with the resolved ruleset", () => {
      const dto = buildDto({
        team: [{ id: "" } as any, { id: "pikachu" } as any, { id: undefined } as any],
      });

      const result = ExternalTournamentMapper.fromForm(dto, "auth0|owner");

      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledTimes(1);
      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledWith(
        dto.team[1],
        RULESET,
      );
      expect(result.team).toEqual([{ id: "pikachu", fromForm: true }]);
    });

    it("sets the owner to the given sub and starts with no matchups", () => {
      const dto = buildDto();

      const result = ExternalTournamentMapper.fromForm(dto, "auth0|owner-2");

      expect(result.owner).toBe("auth0|owner-2");
      expect(result.matchups).toEqual([]);
    });
  });

  describe("fromDatabase", () => {
    function buildDoc(overrides: Partial<ExternalTournamentDocument> = {}) {
      return {
        _id: "doc-id",
        leagueName: "Spring League",
        teamName: "Team Rocket",
        leagueId: "springleague",
        format: "Singles",
        ruleset: "Gen9 NatDex",
        owner: "auth0|owner",
        doc: "doc-key",
        team: [{ id: "squirtle" }],
        ...overrides,
      } as unknown as ExternalTournamentDocument;
    }

    it("resolves the ruleset and format from the stored ids", () => {
      const doc = buildDoc();

      ExternalTournamentMapper.fromDatabase(doc, []);

      expect(mockedGetRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockedGetFormat).toHaveBeenCalledWith("Singles");
    });

    it("maps the team using the resolved ruleset and carries the key from leagueId", () => {
      const doc = buildDoc();

      const result = ExternalTournamentMapper.fromDatabase(doc, []);

      expect(mockedPokemonMapper.fromDatabase).toHaveBeenCalledWith(
        doc.team[0],
        RULESET,
      );
      expect(result.team).toEqual([{ id: "squirtle", fromDatabase: true }]);
      expect(result.key).toBe("springleague");
    });

    it("passes the given matchups through unchanged", () => {
      const doc = buildDoc();
      const matchups = [{ stage: "Round 1" }] as any;

      const result = ExternalTournamentMapper.fromDatabase(doc, matchups);

      expect(result.matchups).toBe(matchups);
    });
  });
});
