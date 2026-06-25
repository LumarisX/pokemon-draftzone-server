import { ExternalMatch } from "./external-matchup-match.domain";
import { ExternalMatchDto } from "./external-matchup-match.dto";
import { MatchMapper } from "./external-matchup-match.mapper";
import { ExternalMatchEntity } from "./external-matchup-match.schema";

function buildMatch(overrides: Partial<ConstructorParameters<typeof ExternalMatch>[0]> = {}) {
  return new ExternalMatch({
    winner: "a",
    replay: "replay-1",
    aTeam: { score: 3, stats: [["pikachu", { kills: 2, deaths: 1 }]] },
    bTeam: { score: 1, stats: [["charizard", { kills: 1, deaths: 2 }]] },
    ...overrides,
  });
}

describe("MatchMapper", () => {
  describe("toClientPayload", () => {
    it("passes the match fields through as the client DTO shape", () => {
      const match = buildMatch();

      const result = MatchMapper.toClientPayload(match);

      expect(result).toEqual({
        winner: "a",
        replay: "replay-1",
        aTeam: match.aTeam,
        bTeam: match.bTeam,
      });
    });

    it("leaves bTeam undefined when there is no second team", () => {
      const match = buildMatch({ bTeam: undefined });

      const result = MatchMapper.toClientPayload(match);

      expect(result.bTeam).toBeUndefined();
    });
  });

  describe("toDatabasePayload", () => {
    it("maps both teams' stats tuples to the database shape", () => {
      const match = buildMatch();

      const result = MatchMapper.toDatabasePayload(match);

      expect(result).toEqual({
        winner: "a",
        replay: "replay-1",
        aTeam: {
          score: 3,
          stats: [["pikachu", { kills: 2, deaths: 1, brought: undefined, indirect: undefined }]],
        },
        bTeam: {
          score: 1,
          stats: [["charizard", { kills: 1, deaths: 2, brought: undefined, indirect: undefined }]],
        },
      });
    });

    it("defaults bTeam to an empty, scoreless team when there is no second team", () => {
      const match = buildMatch({ bTeam: undefined });

      const result = MatchMapper.toDatabasePayload(match);

      expect(result.bTeam).toEqual({ stats: [], score: 0 });
    });
  });

  describe("fromForm", () => {
    function buildDto(overrides: Partial<ExternalMatchDto> = {}): ExternalMatchDto {
      return {
        winner: "b",
        replay: "replay-2",
        aTeam: { score: 2, stats: [["pikachu", { kills: 1 }]] },
        bTeam: { score: 4, stats: [["charizard", { kills: 3 }]] },
        ...overrides,
      };
    }

    it("builds an ExternalMatch from the form DTO", () => {
      const dto = buildDto();

      const result = MatchMapper.fromForm(dto);

      expect(result).toBeInstanceOf(ExternalMatch);
      expect(result.winner).toBe("b");
      expect(result.replay).toBe("replay-2");
      expect(result.aTeam).toEqual({
        score: 2,
        stats: [["pikachu", { brought: undefined, kills: 1, deaths: undefined, indirect: undefined }]],
      });
      expect(result.bTeam).toEqual({
        score: 4,
        stats: [["charizard", { brought: undefined, kills: 3, deaths: undefined, indirect: undefined }]],
      });
    });

    it("leaves bTeam undefined when the DTO has no bTeam", () => {
      const dto = buildDto({ bTeam: undefined });

      const result = MatchMapper.fromForm(dto);

      expect(result.bTeam).toBeUndefined();
    });
  });

  describe("fromDatabase", () => {
    function buildEntity(overrides: Partial<ExternalMatchEntity> = {}): ExternalMatchEntity {
      return {
        winner: "a",
        replay: "replay-3",
        aTeam: { score: 5, stats: [["pikachu", { kills: 4 }]] },
        bTeam: { score: 0, stats: [] },
        ...overrides,
      };
    }

    it("builds an ExternalMatch from the persisted entity", () => {
      const entity = buildEntity();

      const result = MatchMapper.fromDatabase(entity);

      expect(result).toBeInstanceOf(ExternalMatch);
      expect(result.winner).toBe("a");
      expect(result.aTeam).toEqual({
        score: 5,
        stats: [["pikachu", { brought: undefined, kills: 4, deaths: undefined, indirect: undefined }]],
      });
    });

    it("treats an empty bTeam.stats array as no second team, even with a nonzero score", () => {
      const entity = buildEntity({ bTeam: { score: 0, stats: [] } });

      const result = MatchMapper.fromDatabase(entity);

      expect(result.bTeam).toBeUndefined();
    });

    it("maps bTeam when it has at least one stat entry", () => {
      const entity = buildEntity({
        bTeam: { score: 2, stats: [["charizard", { deaths: 1 }]] },
      });

      const result = MatchMapper.fromDatabase(entity);

      expect(result.bTeam).toEqual({
        score: 2,
        stats: [["charizard", { brought: undefined, kills: undefined, deaths: 1, indirect: undefined }]],
      });
    });
  });
});
