import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ExternalTournamentDocument } from "@modules/tournament/sub-modules/external-tournament/external-tournament.schema";
import { Types } from "mongoose";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchup, MatchupSide } from "./external-matchup.domain";
import { ExternalMatchupDto } from "./external-matchup.dto";
import { ExternalMatchupMapper } from "./external-matchup.mapper";
import { ExternalMatchupDocument } from "./external-matchup.schema";

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
jest.mock("./external-matchup-match/external-matchup-match.mapper", () => ({
  MatchMapper: {
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
const mockedMatchMapper = MatchMapper as jest.Mocked<typeof MatchMapper>;

const RULESET = { name: "Gen9 NatDex" } as any;
const FORMAT = { name: "Singles", level: 100, choose: 6, layout: "1" } as any;

function buildSide(overrides: Partial<MatchupSide> = {}): MatchupSide {
  return { team: [], teamName: "Team Rocket", ...overrides };
}

function buildMatchup(
  overrides: Partial<ConstructorParameters<typeof ExternalMatchup>[0]> = {},
) {
  return new ExternalMatchup({
    aTeam: buildSide({ id: new Types.ObjectId(), paste: "a-paste" }),
    bTeam: buildSide({ id: new Types.ObjectId(), coach: "coach-1", paste: "b-paste" }),
    ruleset: RULESET,
    format: FORMAT,
    ...overrides,
  });
}

describe("ExternalMatchupMapper", () => {
  beforeEach(() => {
    mockedGetFormat.mockReturnValue(FORMAT);
    mockedGetRuleset.mockReturnValue(RULESET);
    mockedPokemonMapper.fromForm.mockImplementation(
      (p: any) => ({ id: p.id, fromForm: true }) as any,
    );
    mockedPokemonMapper.fromDatabase.mockImplementation(
      (p: any) => ({ id: p.id, fromDatabase: true }) as any,
    );
    mockedPokemonMapper.toDatabasePayload.mockImplementation(
      (p: any) => ({ id: p.id, toDatabasePayload: true }) as any,
    );
    mockedPokemonMapper.toClientPayload.mockImplementation(
      (p: any) => ({ id: p.id, toClientPayload: true }) as any,
    );
    mockedMatchMapper.toDatabasePayload.mockImplementation(
      (m: any) => ({ ...m, toDatabasePayload: true }) as any,
    );
    mockedMatchMapper.toClientPayload.mockImplementation(
      (m: any) => ({ ...m, toClientPayload: true }) as any,
    );
  });

  describe("toClientPayload", () => {
    it("maps the bTeam's fields and includes the calculated score and raw matches", () => {
      const pokemon = [{ id: "pikachu" }] as any;
      const matchup = buildMatchup({
        bTeam: buildSide({ id: "matchup-1" as any, team: pokemon, coach: "coach-1", paste: "b-paste" }),
        stage: "Round 1",
        matches: [],
      });

      const result = ExternalMatchupMapper.toClientPayload(matchup);

      expect(result).toEqual({
        _id: "matchup-1",
        stage: "Round 1",
        teamName: "Team Rocket",
        coach: "coach-1",
        team: [{ id: "pikachu", toClientPayload: true }],
        score: null,
        matches: [],
        paste: "b-paste",
      });
    });
  });

  describe("toScorePayload", () => {
    it("maps both teams plus the calculated score and per-match client payloads", () => {
      const aPokemon = [{ id: "pikachu" }] as any;
      const bPokemon = [{ id: "charizard" }] as any;
      const storedMatch = { winner: "a" } as any;
      const matchup = buildMatchup({
        tournamentName: "Spring Cup",
        aTeam: buildSide({ id: "a-id" as any, teamName: "Team Rocket", team: aPokemon, paste: "a-paste" }),
        bTeam: buildSide({ id: "matchup-1" as any, teamName: "Challenger", team: bPokemon, coach: "coach-1", paste: "b-paste" }),
        stage: "Round 1",
        matches: [storedMatch],
      });

      const result = ExternalMatchupMapper.toScorePayload(matchup);

      // called via matches.map, so storedMatch is the first arg of the call
      expect(mockedMatchMapper.toClientPayload.mock.calls[0][0]).toBe(storedMatch);
      expect(result).toEqual({
        _id: "matchup-1",
        leagueName: "Spring Cup",
        stage: "Round 1",
        // single match with no stats => 0 alive Pokémon on each side
        score: [0, 0],
        aTeam: {
          teamName: "Team Rocket",
          team: [{ id: "pikachu", toClientPayload: true }],
          paste: "a-paste",
        },
        bTeam: {
          teamName: "Challenger",
          coach: "coach-1",
          team: [{ id: "charizard", toClientPayload: true }],
          paste: "b-paste",
        },
        matches: [{ winner: "a", toClientPayload: true }],
      });
    });
  });

  describe("toDatabasePayload", () => {
    it("maps aTeam to a bare reference and bTeam to the full team payload", () => {
      const pokemon = [{ id: "charizard" }] as any;
      const aTeamId = new Types.ObjectId();
      const matchup = buildMatchup({
        aTeam: buildSide({ id: aTeamId, paste: "a-paste" }),
        bTeam: buildSide({ team: pokemon, teamName: "Challenger", coach: "coach-2", paste: "b-paste" }),
        stage: "Round 2",
        matches: [{ winner: "a" } as any],
      });

      const result = ExternalMatchupMapper.toDatabasePayload(matchup);

      expect(result).toEqual({
        aTeam: { _id: aTeamId, paste: "a-paste" },
        bTeam: {
          teamName: "Challenger",
          coach: "coach-2",
          team: [{ id: "charizard", toDatabasePayload: true }],
          paste: "b-paste",
        },
        stage: "Round 2",
        matches: [{ winner: "a", toDatabasePayload: true }],
      });
    });

    it("defaults stage to an empty string and coach to undefined when missing", () => {
      const matchup = buildMatchup({
        bTeam: buildSide({ coach: undefined }),
        stage: undefined,
      });

      const result = ExternalMatchupMapper.toDatabasePayload(matchup);

      expect(result.stage).toBe("");
      expect(result.bTeam.coach).toBeUndefined();
    });
  });

  describe("fromForm", () => {
    function buildDto(overrides: Partial<ExternalMatchupDto> = {}): ExternalMatchupDto {
      return {
        stage: "Round 3",
        teamName: "Challenger",
        coach: "coach-3",
        matches: undefined as any,
        team: [],
        ...overrides,
      } as ExternalMatchupDto;
    }

    it("carries the ruleset, format, and tournament name over from the existing matchup", () => {
      const existing = buildMatchup({ tournamentName: "Spring Cup" });

      const result = ExternalMatchupMapper.fromForm(buildDto(), existing);

      expect(result.ruleset).toBe(existing.ruleset);
      expect(result.format).toBe(existing.format);
      expect(result.tournamentName).toBe("Spring Cup");
    });

    it("falls back to the existing stage and matches when the DTO omits them", () => {
      const existingMatches = [{ winner: "a" }] as any;
      const existing = buildMatchup({ stage: "Round 1", matches: existingMatches });
      const dto = buildDto({ stage: undefined as any, matches: undefined as any });

      const result = ExternalMatchupMapper.fromForm(dto, existing);

      expect(result.stage).toBe("Round 1");
      expect(result.matches).toBe(existingMatches);
    });

    it("maps the DTO's matches through MatchMapper when provided", () => {
      mockedMatchMapper.fromForm.mockImplementation((m: any) => ({ mapped: m }) as any);
      const existing = buildMatchup();
      const dto = buildDto({ matches: [{ winner: "b" } as any] });

      const result = ExternalMatchupMapper.fromForm(dto, existing);

      expect(mockedMatchMapper.fromForm).toHaveBeenCalledWith(dto.matches[0]);
      expect(result.matches).toEqual([{ mapped: dto.matches[0] }]);
    });

    it("keeps aTeam unchanged from the existing matchup", () => {
      const existing = buildMatchup();

      const result = ExternalMatchupMapper.fromForm(buildDto(), existing);

      expect(result.aTeam).toBe(existing.aTeam);
    });

    it("filters out bTeam entries without an id and maps the rest with the existing ruleset", () => {
      const existing = buildMatchup();
      const dto = buildDto({
        team: [{ id: "" } as any, { id: "squirtle" } as any],
      });

      const result = ExternalMatchupMapper.fromForm(dto, existing);

      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledTimes(1);
      expect(mockedPokemonMapper.fromForm).toHaveBeenCalledWith(
        dto.team[1],
        existing.ruleset,
      );
      expect(result.bTeam.team).toEqual([{ id: "squirtle", fromForm: true }]);
    });

    it("preserves the existing bTeam's id and paste while taking the new teamName/coach", () => {
      const existing = buildMatchup({
        bTeam: buildSide({ id: "matchup-1" as any, paste: "old-paste" }),
      });
      const dto = buildDto({ teamName: "New Name", coach: "new-coach" });

      const result = ExternalMatchupMapper.fromForm(dto, existing);

      expect(result.bTeam.id).toBe("matchup-1");
      expect(result.bTeam.paste).toBe("old-paste");
      expect(result.bTeam.teamName).toBe("New Name");
      expect(result.bTeam.coach).toBe("new-coach");
    });
  });

  describe("fromDatabase", () => {
    function buildTournamentDoc(
      overrides: Partial<ExternalTournamentDocument> = {},
    ) {
      return {
        _id: new Types.ObjectId(),
        leagueName: "Spring Cup",
        teamName: "Team Rocket",
        ruleset: "Gen9 NatDex",
        format: "Singles",
        owner: "auth0|owner",
        team: [{ id: "bulbasaur" }],
        ...overrides,
      } as unknown as ExternalTournamentDocument;
    }

    function buildMatchupDoc(overrides: Partial<ExternalMatchupDocument> = {}) {
      return {
        _id: new Types.ObjectId(),
        stage: "Round 1",
        notes: "a-notes",
        aTeam: { paste: "a-paste" },
        bTeam: { team: [{ id: "wartortle" }], teamName: "Challenger", coach: "coach-1", paste: "b-paste" },
        matches: undefined,
        ...overrides,
      } as unknown as ExternalMatchupDocument;
    }

    it("resolves the ruleset and format from the tournament document", () => {
      const tournamentDoc = buildTournamentDoc();
      const matchupDoc = buildMatchupDoc();

      ExternalMatchupMapper.fromDatabase(matchupDoc, tournamentDoc);

      expect(mockedGetRuleset).toHaveBeenCalledWith("Gen9 NatDex");
      expect(mockedGetFormat).toHaveBeenCalledWith("Singles");
    });

    it("defaults matches to an empty array when the document has none", () => {
      const result = ExternalMatchupMapper.fromDatabase(
        buildMatchupDoc({ matches: undefined }),
        buildTournamentDoc(),
      );

      expect(result.matches).toEqual([]);
    });

    it("maps stored matches through MatchMapper.fromDatabase", () => {
      mockedMatchMapper.fromDatabase.mockImplementation((m: any) => ({ mapped: m }) as any);
      const storedMatch = { winner: "a" } as any;

      const result = ExternalMatchupMapper.fromDatabase(
        buildMatchupDoc({ matches: [storedMatch] }),
        buildTournamentDoc(),
      );

      expect(mockedMatchMapper.fromDatabase).toHaveBeenCalledWith(storedMatch);
      expect(result.matches).toEqual([{ mapped: storedMatch }]);
    });

    it("builds aTeam from the tournament document, including owner and notes", () => {
      const tournamentDoc = buildTournamentDoc();
      const matchupDoc = buildMatchupDoc({ notes: "a-notes" });

      const result = ExternalMatchupMapper.fromDatabase(matchupDoc, tournamentDoc);

      expect(result.aTeam).toEqual({
        id: tournamentDoc._id,
        team: [{ id: "bulbasaur", fromDatabase: true }],
        teamName: "Team Rocket",
        owner: "auth0|owner",
        paste: "a-paste",
        notes: "a-notes",
      });
      expect(mockedPokemonMapper.fromDatabase).toHaveBeenCalledWith(
        tournamentDoc.team[0],
        RULESET,
      );
    });

    it("builds bTeam from the matchup document", () => {
      const matchupDoc = buildMatchupDoc();

      const result = ExternalMatchupMapper.fromDatabase(
        matchupDoc,
        buildTournamentDoc(),
      );

      expect(result.bTeam).toEqual({
        id: matchupDoc._id,
        team: [{ id: "wartortle", fromDatabase: true }],
        teamName: "Challenger",
        coach: "coach-1",
        paste: "b-paste",
      });
    });

    it("parses the stored gameTime string into a Date and carries the reminder lead time", () => {
      const matchupDoc = buildMatchupDoc({
        gameTime: "2026-02-01T00:00:00.000Z",
        reminder: 60,
      });

      const result = ExternalMatchupMapper.fromDatabase(
        matchupDoc,
        buildTournamentDoc(),
      );

      expect(result.gameTime).toEqual(new Date("2026-02-01T00:00:00.000Z"));
      expect(result.reminder).toBe(60);
    });

    it("leaves gameTime undefined when none is stored", () => {
      const matchupDoc = buildMatchupDoc({ gameTime: undefined, reminder: undefined });

      const result = ExternalMatchupMapper.fromDatabase(
        matchupDoc,
        buildTournamentDoc(),
      );

      expect(result.gameTime).toBeUndefined();
      expect(result.reminder).toBeUndefined();
    });
  });
});
