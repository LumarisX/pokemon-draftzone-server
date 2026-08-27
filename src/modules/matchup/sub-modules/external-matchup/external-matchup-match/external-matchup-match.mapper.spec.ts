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
          stats: [
            [
              "pikachu",
              { kills: 2, indirect: 0, teammate: 0, deaths: 1, brought: 1, status: "fainted" },
            ],
          ],
        },
        bTeam: {
          score: 1,
          stats: [
            [
              "charizard",
              { kills: 1, indirect: 0, teammate: 0, deaths: 1, brought: 1, status: "fainted" },
            ],
          ],
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
        stats: [
          [
            "pikachu",
            { brought: 1, kills: 1, indirect: 0, teammate: 0, deaths: 0, status: "survived" },
          ],
        ],
      });
      expect(result.bTeam).toEqual({
        score: 4,
        stats: [
          [
            "charizard",
            { brought: 1, kills: 3, indirect: 0, teammate: 0, deaths: 0, status: "survived" },
          ],
        ],
      });
    });

    it("keeps an explicit team-preview status without counting it as played", () => {
      const dto = buildDto({
        aTeam: { score: 0, stats: [["pikachu", { status: "brought" }]] },
      });

      const result = MatchMapper.fromForm(dto);

      expect(result.aTeam.stats).toEqual([
        [
          "pikachu",
          { brought: 0, kills: 0, indirect: 0, teammate: 0, deaths: 0, status: "brought" },
        ],
      ]);
    });

    it("derives a status from the legacy brought/deaths flags", () => {
      const dto = buildDto({
        aTeam: {
          score: 0,
          stats: [
            ["pikachu", { brought: 1, deaths: 0 }],
            ["charizard", { brought: 1, deaths: 1 }],
          ],
        },
      });

      const result = MatchMapper.fromForm(dto);

      expect(result.aTeam.stats.map(([id, stat]) => [id, stat.status])).toEqual([
        ["pikachu", "survived"],
        ["charizard", "fainted"],
      ]);
    });

    it("leaves bTeam undefined when the DTO has no bTeam", () => {
      const dto = buildDto({ bTeam: undefined });

      const result = MatchMapper.fromForm(dto);

      expect(result.bTeam).toBeUndefined();
    });
  });

  // Regression: these statics used to call `this.mapTeam*`, which threw
  // ("Cannot read properties of undefined") when the method was passed as an
  // unbound callback to Array.map — exactly how the service/repository use them.
  describe("unbound usage as an Array.map callback", () => {
    it("fromForm survives being passed by reference to map", () => {
      const dtos: ExternalMatchDto[] = [
        {
          winner: "b",
          aTeam: { score: 0, stats: [] },
          bTeam: { score: 0, stats: [] },
        },
      ];

      expect(() => dtos.map(MatchMapper.fromForm)).not.toThrow();
      const [result] = dtos.map(MatchMapper.fromForm);
      expect(result).toBeInstanceOf(ExternalMatch);
    });

    it("toDatabasePayload survives being passed by reference to map", () => {
      const matches = [
        new ExternalMatch({
          winner: "a",
          aTeam: { score: 1, stats: [["pikachu", { kills: 1 }]] },
          bTeam: { score: 0, stats: [] },
        }),
      ];

      expect(() => matches.map(MatchMapper.toDatabasePayload)).not.toThrow();
      const [result] = matches.map(MatchMapper.toDatabasePayload);
      expect(result.aTeam.stats).toEqual([
        [
          "pikachu",
          { kills: 1, indirect: 0, teammate: 0, deaths: 0, brought: 1, status: "survived" },
        ],
      ]);
    });

    it("fromDatabase survives being passed by reference to map", () => {
      const entities: ExternalMatchEntity[] = [
        {
          winner: "a",
          aTeam: { score: 1, stats: [["pikachu", { kills: 1 }]] },
          bTeam: { score: 0, stats: [] },
        },
      ];

      expect(() => entities.map(MatchMapper.fromDatabase)).not.toThrow();
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
        stats: [
          [
            "pikachu",
            { brought: 1, kills: 4, indirect: 0, teammate: 0, deaths: 0, status: "survived" },
          ],
        ],
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
        stats: [
          [
            "charizard",
            { brought: 1, kills: 0, indirect: 0, teammate: 0, deaths: 1, status: "fainted" },
          ],
        ],
      });
    });
  });
});
