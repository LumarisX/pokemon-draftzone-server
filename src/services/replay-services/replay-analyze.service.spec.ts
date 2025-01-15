import { ReplayAnalysis, ReplayStats } from "./replay-analyze.service";

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
          id: string;
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
          team: [
            {
              kills: [0, 0],
              brought: false,
              fainted: false,
              moveset: [],
              damageDealt: [0, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "chienpao",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [186, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "groudon",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [45, 0],
              damageTaken: [82, 36],
              hpRestored: 0,
              formes: [
                {
                  id: "tapufini",
                },
              ],
            },
            {
              kills: [2, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [142, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "sceptile",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: false,
              fainted: false,
              moveset: [],
              damageDealt: [0, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "volcarona",
                },
              ],
            },
            {
              kills: [1, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [54, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "zoroarkhisui",
                },
              ],
            },
          ],
        },
        {
          username: "notagreatrainer",
          win: true,
          stats: { switches: 7 },
          total: { kills: 4, deaths: 2, damageDealt: 319, damageTaken: 374 },
          team: [
            {
              kills: [1, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [0, 0],
              damageTaken: [119, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "zygarde",
                },
              ],
            },
            {
              kills: [1, 0],
              brought: true,
              fainted: false,
              moveset: [],
              damageDealt: [158, 0],
              damageTaken: [62, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "chiyu",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: true,
              fainted: true,
              moveset: [],
              damageDealt: [29.5, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "mienshao",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: false,
              fainted: false,
              moveset: [],
              damageDealt: [0, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "comfey",
                },
              ],
            },
            {
              kills: [0, 0],
              brought: false,
              fainted: false,
              moveset: [],
              damageDealt: [0, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "eelektross",
                },
              ],
            },
            {
              kills: [1, 1],
              brought: true,
              fainted: false,
              moveset: [],
              damageDealt: [147, 36],
              damageTaken: [94, 0],
              hpRestored: 0,
              formes: [
                {
                  id: "mukalola",
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

describe("Replay Analyzer", () => {
  describe("Replay Analyzer Service", () => {
    test("should analyze replay data correctly", () => {
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
        replayData = new ReplayAnalysis(text);
        analysis = replayData.analyze();
      });

      test("correct number of turns", () => {
        expect(analysis.turns).toEqual(replay.expected.turns);
      });

      test("correct generation number", () => {
        expect(analysis.genNum).toEqual(replay.expected.genNum);
      });

      test("correct game type", () => {
        expect(analysis.gametype).toEqual(replay.expected.gametype);
      });

      test("correct game time", () => {
        expect(analysis.gameTime).toEqual(replay.expected.gameTime);
      });

      describe("Events", () => {
        test("count", () => {
          expect(analysis.events.length).toEqual(replay.expected.events);
        });
      });

      describe("Stats", () => {
        for (let i = 0; i < 2; i++) {
          describe(`Player ${i + 1}`, () => {
            test("username", () => {
              expect(analysis.stats[i].username).toEqual(
                replay.expected.stats[i].username
              );
            });
            test("win", () => {
              expect(analysis.stats[i].win).toEqual(
                replay.expected.stats[i].win
              );
            });
            describe("Total", () => {
              test("kills", () => {
                expect(analysis.stats[i].total.kills).toEqual(
                  replay.expected.stats[i].total.kills
                );
              });
              test("deaths", () => {
                expect(analysis.stats[i].total.deaths).toEqual(
                  replay.expected.stats[i].total.deaths
                );
              });
              test("damage dealt", () => {
                expect(analysis.stats[i].total.damageDealt).toBeCloseTo(
                  replay.expected.stats[i].total.damageDealt,
                  0
                );
              });
              test("damage taken", () => {
                expect(analysis.stats[i].total.damageTaken).toBeCloseTo(
                  replay.expected.stats[i].total.damageTaken,
                  0
                );
              });
            });

            describe("Team", () => {
              test("size", () => {
                expect(analysis.stats[i].team.length).toEqual(
                  replay.expected.stats[i].team.length
                );
              });

              replay.expected.stats[i].team.forEach((pokemon, index) => {
                describe(`Pokemon ${index + 1}`, () => {
                  test("name matches", () => {
                    expect(
                      analysis.stats[i].team[index].formes[0]
                    ).toBeDefined();
                    expect(analysis.stats[i].team[index].formes[0].id).toBe(
                      pokemon.formes[0].id
                    );
                  });
                  test("brought", () => {
                    expect(analysis.stats[i].team[index].brought).toBe(
                      replay.expected.stats[i].team[index].brought
                    );
                  });
                  test("fainted", () => {
                    expect(analysis.stats[i].team[index].fainted).toBe(
                      replay.expected.stats[i].team[index].fainted
                    );
                  });
                  describe("Kills", () => {
                    test("direct", () => {
                      expect(analysis.stats[i].team[index].kills[0]).toEqual(
                        replay.expected.stats[i].team[index].kills[0]
                      );
                    });
                    test("indirect", () => {
                      expect(analysis.stats[i].team[index].kills[1]).toEqual(
                        replay.expected.stats[i].team[index].kills[1]
                      );
                    });
                  });
                  describe("Damage Taken", () => {
                    test("direct", () => {
                      expect(
                        analysis.stats[i].team[index].damageTaken[0]
                      ).toBeCloseTo(
                        replay.expected.stats[i].team[index].damageTaken[0],
                        0
                      );
                    });
                    test("indirect", () => {
                      expect(
                        analysis.stats[i].team[index].damageTaken[1]
                      ).toBeCloseTo(
                        replay.expected.stats[i].team[index].damageTaken[1],
                        0
                      );
                    });
                  });
                  describe("Damage Dealt", () => {
                    test("direct", () => {
                      expect(
                        analysis.stats[i].team[index].damageDealt[0]
                      ).toBeCloseTo(
                        replay.expected.stats[i].team[index].damageDealt[0],
                        0
                      );
                    });
                    test("indirect", () => {
                      expect(
                        analysis.stats[i].team[index].damageDealt[1]
                      ).toBeCloseTo(
                        replay.expected.stats[i].team[index].damageDealt[1],
                        0
                      );
                    });
                  });
                });
              });
            });
          });
        }
      });
    });
  });
});
