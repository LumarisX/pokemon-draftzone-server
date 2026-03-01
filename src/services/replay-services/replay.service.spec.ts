import path from "path";
import { formatUrl, Replay, validateUrl } from "./replay.service";

type FixtureExpectation = {
  fileName: string;
  expected: {
    gametype: string;
    genNum: number;
    turns: number;
    gameTime: number;
    events: number;
    players: {
      username: string | undefined;
      win: boolean;
      kills: number;
      deaths: number;
      switches: number;
      damageDealt?: number;
      damageTaken?: number;
      featuredPokemon?: {
        id: string;
        status: "fainted" | "brought" | "used";
      };
    }[];
  };
};

const fixtures: FixtureExpectation[] = [
  {
    fileName: "gen9draft-2547354745.log",
    expected: {
      gametype: "Singles",
      genNum: 9,
      turns: 27,
      gameTime: 516,
      events: 11,
      players: [
        {
          username: "superspiderpigg",
          win: false,
          kills: 4,
          deaths: 6,
          switches: 10,
          damageTaken: 607,
          featuredPokemon: {
            id: "ogerponhearthflame",
            status: "fainted",
          },
        },
        {
          username: "redboy128",
          win: true,
          kills: 6,
          deaths: 4,
          switches: 10,
          damageDealt: 607,
          featuredPokemon: {
            id: "gliscor",
            status: "used",
          },
        },
      ],
    },
  },
  {
    fileName: "gen94v4doublesdraft-2548605967.log",
    expected: {
      gametype: "Doubles",
      genNum: 9,
      turns: 11,
      gameTime: 373,
      events: 7,
      players: [
        {
          username: "Dddddsf",
          win: true,
          kills: 3,
          deaths: 2,
          switches: 4,
          damageDealt: 366,
          damageTaken: 261,
          featuredPokemon: {
            id: "rotomwash",
            status: "used",
          },
        },
        {
          username: "McHoss",
          win: false,
          kills: 2,
          deaths: 4,
          switches: 7,
          damageDealt: 289,
          damageTaken: 418,
          featuredPokemon: {
            id: "charizard",
            status: "fainted",
          },
        },
      ],
    },
  },
];

describe("Replay Service", () => {
  describe.each(fixtures)("$fileName", ({ fileName, expected }) => {
    let analysis: {
      gametype: string;
      genNum: number;
      turns: number;
      gameTime: number;
      stats: Replay.Stats[];
      events: { player: number; turn: number; message: string }[];
    };

    beforeAll(async () => {
      const replayPath = path.join(__dirname, "test-replays", fileName);
      const replay = await Replay.Analysis.fromReplayFile(replayPath);
      analysis = replay.toJson();
    });

    test("matches top-level metadata", () => {
      expect(analysis.gametype).toBe(expected.gametype);
      expect(analysis.genNum).toBe(expected.genNum);
      expect(analysis.turns).toBe(expected.turns);
      expect(analysis.gameTime).toBe(expected.gameTime);
      expect(analysis.events).toHaveLength(expected.events);
      expect(analysis.stats).toHaveLength(2);
    });

    test("matches expected player summary", () => {
      expected.players.forEach((playerExpected, index) => {
        const actual = analysis.stats[index];
        expect(actual.username).toBe(playerExpected.username);
        expect(actual.win).toBe(playerExpected.win);
        expect(actual.total.kills).toBe(playerExpected.kills);
        expect(actual.total.deaths).toBe(playerExpected.deaths);
        expect(actual.stats.switches).toBe(playerExpected.switches);

        if (playerExpected.damageDealt !== undefined) {
          expect(actual.total.damageDealt).toBeCloseTo(
            playerExpected.damageDealt,
            0,
          );
        }
        if (playerExpected.damageTaken !== undefined) {
          expect(actual.total.damageTaken).toBeCloseTo(
            playerExpected.damageTaken,
            0,
          );
        }

        if (playerExpected.featuredPokemon) {
          const featuredPokemon = actual.team.find(
            (pokemon) =>
              pokemon.formes[0]?.id === playerExpected.featuredPokemon?.id,
          );
          expect(featuredPokemon).toBeDefined();
          expect(featuredPokemon?.status).toBe(
            playerExpected.featuredPokemon.status,
          );
        }
      });
    });

    test("team entries include at least one identified forme", () => {
      analysis.stats.forEach((player) => {
        expect(player.team.length).toBeGreaterThan(0);
        player.team.forEach((pokemon) => {
          expect(pokemon.formes.length).toBeGreaterThan(0);
          expect(pokemon.formes[0]).toBeDefined();
          expect(pokemon.formes[0].id).toBeTruthy();
        });
      });
    });
  });
});

describe("Validate URL", () => {
  test("valid https URL", () => {
    expect(
      validateUrl("https://replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe(true);
  });

  test("valid short URL", () => {
    expect(
      validateUrl("replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe(true);
  });

  test("room URL is invalid", () => {
    expect(
      validateUrl(
        "https://play.pokemonshowdown.com/battle-gen9randombattle-123456",
      ),
    ).toBe(false);
  });
});

describe("Format URL", () => {
  test("formats short URL", () => {
    expect(formatUrl("replay.pokemonshowdown.com/gen9customgame-123456")).toBe(
      "https://replay.pokemonshowdown.com/gen9customgame-123456",
    );
  });

  test("returns full URL unchanged", () => {
    expect(
      formatUrl("https://replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe("https://replay.pokemonshowdown.com/gen9customgame-123456");
  });
});
