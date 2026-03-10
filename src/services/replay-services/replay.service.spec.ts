import fs from "fs";
import path from "path";

import { formatUrl, Replay, validateUrl } from "./replay.service";

type Analysis = ReturnType<Replay.Analysis["toClient"]>["analysis"];

type PlayerSummaryExpectation = {
  username: string;
  win: boolean;
  kills: number;
  deaths: number;
  switches: number;
  teamSize: number;
};

type ReplayFixtureCase = {
  fileName: string;
  expected: {
    gametype: "singles" | "doubles";
    genNum: number;
    turns: number;
    eventCount: number;
    winner: string;
    players: PlayerSummaryExpectation[];
    eventIncludes: string[];
  };
};

const FIXTURE_DIR = path.join(__dirname, "test-replays");

const replayCases: ReplayFixtureCase[] = [
  {
    fileName: "gen8draft-2445027050.log",
    expected: {
      gametype: "singles",
      genNum: 8,
      turns: 73,
      eventCount: 12,
      winner: "notagreatrainer",
      players: [
        {
          username: "Drew0723",
          win: false,
          kills: 5,
          deaths: 6,
          switches: 25,
          teamSize: 6,
        },
        {
          username: "notagreatrainer",
          win: true,
          kills: 5,
          deaths: 5,
          switches: 22,
          teamSize: 6,
        },
      ],
      eventIncludes: ["Rising Voltage", "wins."],
    },
  },
  {
    fileName: "gen94v4doublesdraft-2547091723.log",
    expected: {
      gametype: "doubles",
      genNum: 9,
      turns: 8,
      eventCount: 8,
      winner: "Ogerpons Swamp10",
      players: [
        {
          username: "Ogerpons Swamp10",
          win: true,
          kills: 4,
          deaths: 3,
          switches: 5,
          teamSize: 6,
        },
        {
          username: "hariyamamomma",
          win: false,
          kills: 3,
          deaths: 4,
          switches: 4,
          teamSize: 6,
        },
      ],
      eventIncludes: ["Tera Blast", "wins."],
    },
  },
  {
    fileName: "gen94v4doublesdraft-2548605967.log",
    expected: {
      gametype: "doubles",
      genNum: 9,
      turns: 11,
      eventCount: 7,
      winner: "Dddddsf",
      players: [
        {
          username: "Dddddsf",
          win: true,
          kills: 3,
          deaths: 2,
          switches: 4,
          teamSize: 6,
        },
        {
          username: "McHoss",
          win: false,
          kills: 2,
          deaths: 4,
          switches: 7,
          teamSize: 6,
        },
      ],
      eventIncludes: ["Muddy Water", "wins."],
    },
  },
  {
    fileName: "gen9draft-2547354745.log",
    expected: {
      gametype: "singles",
      genNum: 9,
      turns: 27,
      eventCount: 11,
      winner: "redboy128",
      players: [
        {
          username: "superspiderpigg",
          win: false,
          kills: 4,
          deaths: 6,
          switches: 10,
          teamSize: 6,
        },
        {
          username: "redboy128",
          win: true,
          kills: 6,
          deaths: 4,
          switches: 10,
          teamSize: 6,
        },
      ],
      eventIncludes: ["Tera Starstorm", "wins."],
    },
  },
  {
    fileName: "gen9draft-2549171673.log",
    expected: {
      gametype: "singles",
      genNum: 9,
      turns: 22,
      eventCount: 11,
      winner: "LigerLordX",
      players: [
        {
          username: "rootsgaming",
          win: false,
          kills: 4,
          deaths: 6,
          switches: 10,
          teamSize: 6,
        },
        {
          username: "LigerLordX",
          win: true,
          kills: 6,
          deaths: 4,
          switches: 12,
          teamSize: 6,
        },
      ],
      eventIncludes: ["Poison Jab", "wins."],
    },
  },
];

function getReplayFixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".log"))
    .sort();
}

function normalizeReplayCaseFileNames(): string[] {
  return replayCases.map((fixture) => fixture.fileName).sort();
}

describe("Replay service fixtures", () => {
  test("fixture definitions cover every replay file", () => {
    expect(normalizeReplayCaseFileNames()).toEqual(getReplayFixtureFiles());
  });

  describe.each(replayCases)("$fileName", ({ fileName, expected }) => {
    let analysis: Analysis;

    beforeAll(async () => {
      const replayPath = path.join(FIXTURE_DIR, fileName);
      const replay = await Replay.Analysis.fromReplayFile(replayPath);
      analysis = replay.toClient().analysis;
    });

    test("matches fixture summary", () => {
      expect(analysis.gametype).toBe(expected.gametype);
      expect(analysis.genNum).toBe(expected.genNum);
      expect(analysis.turns).toBe(expected.turns);
      expect(analysis.events).toHaveLength(expected.eventCount);

      const winner = analysis.players.find((player) => player.win);
      expect(winner?.username).toBe(expected.winner);

      expected.players.forEach((expectedPlayer, playerIndex) => {
        const actualPlayer = analysis.players[playerIndex];
        expect(actualPlayer.username).toBe(expectedPlayer.username);
        expect(actualPlayer.win).toBe(expectedPlayer.win);
        expect(actualPlayer.total.kills).toBe(expectedPlayer.kills);
        expect(actualPlayer.total.deaths).toBe(expectedPlayer.deaths);
        expect(actualPlayer.stats.switches).toBe(expectedPlayer.switches);
        expect(actualPlayer.team).toHaveLength(expectedPlayer.teamSize);
      });
    });

    test("satisfies common replay invariants", () => {
      expect(analysis.players).toHaveLength(2);
      expect(analysis.players.filter((player) => player.win)).toHaveLength(1);

      analysis.players.forEach((player) => {
        expect(player.username).toBeTruthy();
        expect(player.team.length).toBeGreaterThan(0);

        player.team.forEach((pokemon) => {
          expect(pokemon.id).toBeTruthy();
          expect(pokemon.name).toBeTruthy();
          expect(pokemon.status).toMatch(/^(brought|survived|fainted)$/);
        });
      });

      analysis.events.forEach((event) => {
        expect(event.turn).toBeGreaterThanOrEqual(0);
        expect(event.turn).toBeLessThanOrEqual(analysis.turns);
        expect(event.message).toBeTruthy();
      });
    });

    test("contains expected edge-case signals", () => {
      const eventText = analysis.events
        .map((event) => event.message)
        .join("\n");
      expected.eventIncludes.forEach((messageFragment) => {
        expect(eventText).toContain(messageFragment);
      });
    });
  });
});

describe("validateUrl", () => {
  test("accepts full replay URL", () => {
    expect(
      validateUrl("https://replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe(true);
  });

  test("accepts replay host without protocol", () => {
    expect(
      validateUrl("replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe(true);
  });

  test("rejects non-replay URL", () => {
    expect(
      validateUrl("https://play.pokemonshowdown.com/battle-gen9randombattle-1"),
    ).toBe(false);
  });
});

describe("formatUrl", () => {
  test("adds protocol when missing", () => {
    expect(formatUrl("replay.pokemonshowdown.com/gen9customgame-123456")).toBe(
      "https://replay.pokemonshowdown.com/gen9customgame-123456",
    );
  });

  test("strips query and hash", () => {
    expect(
      formatUrl(
        "https://replay.pokemonshowdown.com/gen9customgame-123456?foo=1#bar",
      ),
    ).toBe("https://replay.pokemonshowdown.com/gen9customgame-123456");
  });
});
