import fs from "fs";
import path from "path";

import { ReplayParseService } from "./replay-parse.service";
import {
  ReplayAnalysisResult,
  ReplayAnalysisService,
} from "./replay-analysis.service";
import { ReplayStatesService } from "./replay-states.service";

type ReplayFixtureCase = {
  fileName: string;
  expected: {
    gametype: "singles" | "doubles";
    genNum: number;
    turns: number;
    winner: string;
    players: {
      username: string;
      win: boolean;
      kills: number;
      deaths: number;
      switches: number;
      teamSize: number;
    }[];
  };
};

function getExpectedGameTimeFromLog(replayLog: string): number {
  const timestamps = replayLog
    .split("\n")
    .filter((line) => line.startsWith("|t:|"))
    .map((line) => Number(line.split("|")[2]))
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length < 2) return 0;
  return Math.max(Math.max(...timestamps) - Math.min(...timestamps), 0);
}

const replayCases: ReplayFixtureCase[] = [
  {
    fileName: "gen8draft-2445027050.log",
    expected: {
      gametype: "singles",
      genNum: 8,
      turns: 73,
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
    },
  },
  {
    fileName: "gen94v4doublesdraft-2547091723.log",
    expected: {
      gametype: "doubles",
      genNum: 9,
      turns: 8,
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
    },
  },
  {
    fileName: "gen94v4doublesdraft-2548605967.log",
    expected: {
      gametype: "doubles",
      genNum: 9,
      turns: 11,
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
    },
  },
  {
    fileName: "gen9draft-2545881955.log",
    expected: {
      gametype: "singles",
      genNum: 9,
      turns: 20,
      winner: "fallensword912",
      players: [
        {
          username: "fallensword912",
          win: true,
          kills: 6,
          deaths: 1,
          switches: 9,
          teamSize: 6,
        },
        {
          username: "clintonsponsor",
          win: false,
          kills: 1,
          deaths: 6,
          switches: 11,
          teamSize: 6,
        },
      ],
    },
  },
  {
    fileName: "gen9draft-2547354745.log",
    expected: {
      gametype: "singles",
      genNum: 9,
      turns: 27,
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
    },
  },
  {
    fileName: "gen9draft-2549171673.log",
    expected: {
      gametype: "singles",
      genNum: 9,
      turns: 22,
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
    },
  },
];

describe("ReplayAnalysisService", () => {
  const parseService = new ReplayParseService();
  const statesService = new ReplayStatesService();
  const analysisService = new ReplayAnalysisService();

  it("credits destiny bond as a kill for the user", () => {
    const parsed = parseService.parse(
      `
|player|p1|Alice
|player|p2|Bob
|teamsize|p1|1
|teamsize|p2|1
|poke|p1|Pikachu, M|
|poke|p2|Gengar, M|
|switch|p1a: Sparky|Pikachu, M|100/100
|switch|p2a: Shade|Gengar, M|100/100
|turn|1
|move|p2a: Shade|Destiny Bond|p2a: Shade
|-singlemove|p2a: Shade|Destiny Bond
|move|p1a: Sparky|Tackle|p2a: Shade
|-damage|p2a: Shade|0 fnt
|faint|p2a: Shade
|-activate|p2a: Shade|move: Destiny Bond
|faint|p1a: Sparky
|win|Bob
`.trim(),
    );

    const turnStates = statesService.build(parsed);
    const analysis = analysisService.analyze(turnStates);
    const alice = analysis.players.find(
      (player) => player.username === "Alice",
    );
    const bob = analysis.players.find((player) => player.username === "Bob");

    expect(alice?.total.kills).toBe(1);
    expect(alice?.total.deaths).toBe(1);
    expect(bob?.total.kills).toBe(1);
    expect(bob?.total.deaths).toBe(1);
  });

  describe.each(replayCases)("$fileName", ({ fileName, expected }) => {
    it("matches expected replay summary values", () => {
      const replayPath = path.join(__dirname, `test-replays/${fileName}`);
      const replayLog = fs.readFileSync(replayPath, "utf-8");

      const parsed = parseService.parse(replayLog);
      const turnStates = statesService.build(parsed);
      const analysis = analysisService.analyze(turnStates);
      const expectedGameTime = getExpectedGameTimeFromLog(replayLog);

      expect(analysis.gametype).toBe(expected.gametype);
      expect(analysis.genNum).toBe(expected.genNum);
      expect(analysis.turns).toBe(expected.turns);
      expect(analysis.gameTime).toBe(expectedGameTime);

      const winner = analysis.players.find(
        (player: ReplayAnalysisResult["players"][number]) => player.win,
      );
      expect(winner?.username).toBe(expected.winner);

      expected.players.forEach((expectedPlayer, index) => {
        const actual = analysis.players[index];
        expect(actual.username).toBe(expectedPlayer.username);
        expect(actual.win).toBe(expectedPlayer.win);
        expect(
          Math.abs(actual.total.kills - expectedPlayer.kills),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(actual.total.deaths - expectedPlayer.deaths),
        ).toBeLessThanOrEqual(1);
        const teamKillSum = actual.team.reduce(
          (sum, pokemon) =>
            sum +
            pokemon.kills.direct +
            pokemon.kills.indirect +
            pokemon.kills.teammate,
          0,
        );
        expect(teamKillSum).toBe(actual.total.kills);
        expect(actual.stats.switches).toBe(expectedPlayer.switches);
        expect(actual.team).toHaveLength(expectedPlayer.teamSize);
      });

      if (analysis.players.length === 2) {
        const [playerA, playerB] = analysis.players;
        expect(
          Math.abs(playerA.total.kills - playerB.total.deaths),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(playerB.total.kills - playerA.total.deaths),
        ).toBeLessThanOrEqual(1);
      }

      const eventText = analysis.events
        .map((event: ReplayAnalysisResult["events"][number]) => event.message)
        .join("\n");
      expect(eventText).toContain("wins.");
    });
  });
});
