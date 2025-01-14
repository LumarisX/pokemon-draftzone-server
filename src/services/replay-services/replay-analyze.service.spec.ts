// const replayData = await fetch(`${formatUrl(res.url)}.log`);
//           let replay = new Replay(await replayData.text());
//           res.json(replay.analyze());

import { Replay, ReplayStats } from "./replay-analyze.service";

const replays: {
  url: string;
  expected: {
    gametype: string;
    genNum: number;
    turns: number;
    gameTime: number;
    stats: {
      username: string | undefined;
      win: boolean;
      total: {
        kills: number;
        deaths: number;
        damageDealt: number;
        damageTaken: number;
      };
      stats: {
        switches: number;
      };
      team: {
        kills: [number, number];
        brought: boolean;
        fainted: boolean;
        moveset: string[];
        damageDealt: [number, number];
        damageTaken: [number, number];
        hpRestored: number;
        formes: {
          detail: string;
          id?: string;
        }[];
      }[];
    }[];
    events: number;
  };
}[] = [
  {
    url: "https://replay.pokemonshowdown.com/gen9doublescustomgame-2227018912.log",
    expected: {
      gametype: "Doubles",
      genNum: 9,
      turns: 7,
      gameTime: 289,
      events: 7,
      stats: [
        {
          username: "TeamInferno Ted",
          win: false,
          stats: { switches: 4 },
          total: { kills: 3, deaths: 4, damageDealt: 428, damageTaken: 419 },
          team: [],
        },
        {
          username: "notagreatrainer",
          win: true,
          stats: { switches: 7 },
          total: { kills: 4, deaths: 2, damageDealt: 319, damageTaken: 374 },
          team: [],
        },
      ],
    },
  },
];

describe("Replay Analyzer", () => {
  describe("Replay Analyzer Service", () => {
    it("should analyze replay data correctly", () => {
      expect(true).toBe(true);
    });
  });

  describe.each(replays)("Replays", (replay) => {
    describe(replay.url, () => {
      let replayData;
      let analysis: {
        gametype: string;
        genNum: number;
        turns: number;
        gameTime: number;
        stats: ReplayStats[];
        events: {
          player: number;
          turn: number;
          message: string;
        }[];
      };

      beforeAll(async () => {
        const response = await fetch(replay.url);
        const text = await response.text();
        replayData = new Replay(text);
        analysis = replayData.analyze();
      });

      it("correct number of turns", async () => {
        expect(await analysis.turns).toEqual(replay.expected.turns);
      });

      it("correct generation number", async () => {
        expect(await analysis.genNum).toEqual(replay.expected.genNum);
      });

      it("correct game type", async () => {
        expect(await analysis.gametype).toEqual(replay.expected.gametype);
      });

      it("correct game time", async () => {
        expect(await analysis.gameTime).toEqual(replay.expected.gameTime);
      });

      describe("Events", () => {
        it("count", async () => {
          expect(await analysis.events.length).toEqual(replay.expected.events);
        });
      });

      describe("Stats", () => {
        for (let i = 0; i < 2; i++) {
          describe(`Team ${i + 1}`, () => {
            it("username", async () => {
              expect(await analysis.stats[i].username).toEqual(
                replay.expected.stats[i].username
              );
            });
            it("win", async () => {
              expect(await analysis.stats[i].win).toEqual(
                replay.expected.stats[i].win
              );
            });
            describe("Total", () => {
              it("kills", async () => {
                expect(await analysis.stats[i].total.kills).toEqual(
                  replay.expected.stats[i].total.kills
                );
              });
              it("deaths", async () => {
                expect(await analysis.stats[i].total.deaths).toEqual(
                  replay.expected.stats[i].total.deaths
                );
              });
              it("damage dealt", async () => {
                expect(await analysis.stats[i].total.damageDealt).toBeCloseTo(
                  replay.expected.stats[i].total.damageDealt,
                  0
                );
              });
              it("damage taken", async () => {
                expect(await analysis.stats[i].total.damageTaken).toBeCloseTo(
                  replay.expected.stats[i].total.damageTaken,
                  0
                );
              });
            });
          });

          //   describe(await analysis.stats[i].team)("Team members", (pokemon) => {
          //     it("has team members", async () => {
          //       expect(pokemon.damageDealt[0]).toBeGreaterThanOrEqual(0);
          //       expect(pokemon.damageDealt[1]).toBeGreaterThanOrEqual(0);
          //     });
          //   });
        }
      });
    });
  });
});
