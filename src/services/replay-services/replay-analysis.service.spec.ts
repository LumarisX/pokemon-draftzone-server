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

  describe.each(replayCases)("$fileName", ({ fileName, expected }) => {
    it("matches expected replay summary values", () => {
      const replayPath = path.join(__dirname, `test-replays/${fileName}`);
      const replayLog = fs.readFileSync(replayPath, "utf-8");

      const parsed = parseService.parse(replayLog);
      const turnStates = statesService.build(parsed);
      const analysis = analysisService.analyze(turnStates);

      expect(analysis.gametype).toBe(expected.gametype);
      expect(analysis.genNum).toBe(expected.genNum);
      expect(analysis.turns).toBe(expected.turns);

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
