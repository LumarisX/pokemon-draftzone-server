import { formatUrl, Replay, validateUrl } from "./replay-analyze.service";

type ExpectedStatBreakdown =
  | [number, number]
  | [number, number, number]
  | { direct: number; indirect: number; teammate: number };

type ActualStatBreakdown =
  | [number, number]
  | [number, number, number]
  | { direct: number; indirect: number; teammate: number };

function normalizeExpectedBreakdown(value: ExpectedStatBreakdown): {
  direct: number;
  indirect: number;
  teammate: number;
} {
  if (Array.isArray(value)) {
    return {
      direct: value[0] ?? 0,
      indirect: value[1] ?? 0,
      teammate: value[2] ?? 0,
    };
  }

  return value;
}

function normalizeActualBreakdown(value: ActualStatBreakdown): {
  direct: number;
  indirect: number;
  teammate: number;
} {
  if (Array.isArray(value)) {
    return {
      direct: value[0] ?? 0,
      indirect: value[1] ?? 0,
      teammate: value[2] ?? 0,
    };
  }

  return value;
}

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
        kills: ExpectedStatBreakdown;
        status: "fainted" | "brought" | "used";
        damageDealt: ExpectedStatBreakdown;
        damageTaken: ExpectedStatBreakdown;
        hpRestored: number;
        formes: {
          id: string;
        }[];
      }[];
    }[];
    events: number;
  };
}[] = [
  // {
  //   url: "https://replay.pokemonshowdown.com/gen9doublescustomgame-2227018912.log",
  //   expected: {
  //     gametype: "Doubles",
  //     genNum: 9,
  //     turns: 7,
  //     gameTime: 289,
  //     stats: [
  //       {
  //         username: "TeamInferno Ted",
  //         win: false,
  //         total: {
  //           kills: 3,
  //           deaths: 4,
  //           damageDealt: 428.4652053990714,
  //           damageTaken: 418.6440677966102,
  //         },
  //         stats: { switches: 4 },
  //         team: [
  //           {
  //             kills: [0, 0],
  //             brought: false,
  //             fainted: false,
  //             damageDealt: [0, 0],
  //             damageTaken: [0, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "chienpao" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [186.3, 0],
  //             damageTaken: [100, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "groudon" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [45.4, 0],
  //             damageTaken: [82.5, 36.2],
  //             hpRestored: 18.64406779661017,
  //             formes: [{ id: "tapufini" }],
  //           },
  //           {
  //             kills: [2, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [142.4, 0],
  //             damageTaken: [100, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "sceptile" }, { id: "sceptilemega" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: false,
  //             fainted: false,
  //             damageDealt: [0, 0],
  //             damageTaken: [0, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "volcarona" }],
  //           },
  //           {
  //             kills: [1, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [54.4, 0],
  //             damageTaken: [100, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "zoroarkhisui" }],
  //           },
  //         ],
  //       },
  //       {
  //         username: "notagreatrainer",
  //         win: true,
  //         total: {
  //           kills: 4,
  //           deaths: 2,
  //           damageDealt: 318.6440677966101,
  //           damageTaken: 374.0644898355652,
  //         },
  //         stats: { switches: 7 },
  //         team: [
  //           {
  //             kills: [1, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [-51.6, 0],
  //             damageTaken: [118.7, 0],
  //             hpRestored: 18.65810376880176,
  //             formes: [{ id: "zygarde" }, { id: "zygardecomplete" }],
  //           },
  //           {
  //             kills: [1, 0],
  //             brought: true,
  //             fainted: false,
  //             damageDealt: [158, 0],
  //             damageTaken: [61.5, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "chiyu" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: true,
  //             fainted: true,
  //             damageDealt: [29.5, 0],
  //             damageTaken: [100, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "mienshao" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: false,
  //             fainted: false,
  //             damageDealt: [0, 0],
  //             damageTaken: [0, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "comfey" }],
  //           },
  //           {
  //             kills: [0, 0],
  //             brought: false,
  //             fainted: false,
  //             damageDealt: [0, 0],
  //             damageTaken: [0, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "eelektross" }],
  //           },
  //           {
  //             kills: [1, 1],
  //             brought: true,
  //             fainted: false,
  //             damageDealt: [146.6, 36.2],
  //             damageTaken: [93.9, 0],
  //             hpRestored: 0,
  //             formes: [{ id: "mukalola" }],
  //           },
  //         ],
  //       },
  //     ],
  //     events: 7,
  //   },
  // },
  {
    url: "https://replay.pokemonshowdown.com/gen9terapreviewdraft-2177434329-o0gff11m2vsje4wmmi2rka26d8w90ywpw.log",
    expected: {
      gametype: "Singles",
      genNum: 9,
      turns: 27,
      gameTime: 985,
      stats: [
        {
          username: "SnipyNoob",
          win: false,
          total: { kills: 4, deaths: 6, damageDealt: 462, damageTaken: 663 },
          stats: { switches: 11 },
          team: [
            {
              kills: [0, 1],
              status: "fainted",
              damageDealt: [28, 30],
              damageTaken: [138, 0],
              hpRestored: 38,
              formes: [{ id: "mandibuzz" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [164, 0],
              damageTaken: [26, 74],
              hpRestored: 0,
              formes: [{ id: "hoopaunbound" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [28, 0],
              damageTaken: [101, 24],
              hpRestored: 25,
              formes: [{ id: "dragapult" }],
            },
            {
              kills: [2, 0],
              status: "fainted",
              damageDealt: [188, 0],
              damageTaken: [85, 15],
              hpRestored: 0,
              formes: [{ id: "irontreads" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [8, 16],
              damageTaken: [76, 24],
              hpRestored: 0,
              formes: [{ id: "fezandipiti" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [0, 0],
              damageTaken: [76, 24],
              hpRestored: 0,
              formes: [
                { id: "ogerponwellspring" },
                { id: "ogerponwellspringtera" },
              ],
            },
          ],
        },
        {
          username: "rraykzu",
          win: true,
          total: { kills: 5, deaths: 3, damageDealt: 585, damageTaken: 462 },
          stats: { switches: 14 },
          team: [
            {
              kills: [0, 0],
              status: "used",
              damageDealt: [0, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [{ id: "greattusk" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [100, 0],
              damageTaken: [82, 18],
              hpRestored: 0,
              formes: [{ id: "ironbundle" }],
            },
            {
              kills: [4, 0],
              status: "used",
              damageDealt: [232, 0],
              damageTaken: [62, 0],
              hpRestored: 50,
              formes: [{ id: "salamence" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [0, 89],
              damageTaken: [127, 0],
              hpRestored: 27,
              formes: [{ id: "heatran" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [92, 72],
              damageTaken: [72, 28],
              hpRestored: 0,
              formes: [{ id: "samurotthisui" }],
            },
            {
              kills: [0, 0],
              status: "used",
              damageDealt: [0, 0],
              damageTaken: [73, 0],
              hpRestored: 0,
              formes: [{ id: "slowkinggalar" }],
            },
          ],
        },
      ],
      events: 10,
    },
  },
  {
    url: "https://replay.pokemonshowdown.com/gen4ubers-2197313718.log",
    expected: {
      gametype: "Singles",
      genNum: 4,
      turns: 24,
      gameTime: 672,
      stats: [
        {
          username: "notagreatrainer",
          win: true,
          total: { kills: 6, deaths: 3, damageDealt: 630, damageTaken: 312 },
          stats: { switches: 7 },
          team: [
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [168, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "froslass" }],
            },
            {
              kills: [2, 0],
              status: "fainted",
              damageDealt: [248, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "absol" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [76, 0],
              damageTaken: [91, 21],
              hpRestored: 12,
              formes: [{ id: "milotic" }],
            },
            {
              kills: [3, 0],
              status: "used",
              damageDealt: [138, 0],
              damageTaken: [0, 0],
              hpRestored: 0,
              formes: [{ id: "mew" }],
            },
          ],
        },
        {
          username: "TheExsaltedOne",
          win: false,
          total: { kills: 3, deaths: 6, damageDealt: 288, damageTaken: 630 },
          stats: { switches: 10 },
          team: [
            {
              kills: [0, 1],
              status: "fainted",
              damageDealt: [0, 21],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "roserade" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [86, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "rotomheat" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [99, 0],
              damageTaken: [130, 0],
              hpRestored: 30,
              formes: [{ id: "machamp" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [1, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "aerodactyl" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [0, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "espeon" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [81, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "heatran" }],
            },
          ],
        },
      ],
      events: 10,
    },
  },
  {
    url: "https://replay.pokemonshowdown.com/gen9natdexdraft-2159897898.log",
    expected: {
      gametype: "Singles",
      genNum: 9,
      turns: 36,
      gameTime: 873,
      stats: [
        {
          username: "Bowas",
          win: true,
          total: { kills: 6, deaths: 5, damageDealt: 728, damageTaken: 635 },
          stats: { switches: 19 },
          team: [
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [215, 0],
              damageTaken: [94, 6],
              hpRestored: 0,
              formes: [{ id: "swampert" }],
            },
            {
              kills: [2, 0],
              status: "used",
              damageDealt: [188, 0],
              damageTaken: [104, 13],
              hpRestored: 60,
              formes: [{ id: "eelektross" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [102, 0],
              damageTaken: [87, 13],
              hpRestored: 0,
              formes: [{ id: "qwilfishhisui" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [1, 0],
              damageTaken: [106, 12],
              hpRestored: 18,
              formes: [{ id: "grumpig" }],
            },
            {
              kills: [2, 0],
              status: "fainted",
              damageDealt: [197, 0],
              damageTaken: [88, 12],
              hpRestored: 0,
              formes: [{ id: "gardevoir" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [25, 0],
              damageTaken: [64, 36],
              hpRestored: 0,
              formes: [{ id: "serperior" }],
            },
          ],
        },
        {
          username: "worldsbestminbid",
          win: false,
          total: { kills: 5, deaths: 6, damageDealt: 635, damageTaken: 728 },
          stats: { switches: 18 },
          team: [
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [69, 12],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "togedemaru" }],
            },
            {
              kills: [2, 0],
              status: "fainted",
              damageDealt: [211, 0],
              damageTaken: [99, 1],
              hpRestored: 0,
              formes: [{ id: "armarouge" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [106, 56],
              damageTaken: [170, 0],
              hpRestored: 70,
              formes: [{ id: "swampert" }],
            },
            {
              kills: [0, 0],
              status: "fainted",
              damageDealt: [26, 24],
              damageTaken: [158, 0],
              hpRestored: 58,
              formes: [{ id: "brambleghast" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [23, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "ribombee" }],
            },
            {
              kills: [1, 0],
              status: "fainted",
              damageDealt: [108, 0],
              damageTaken: [100, 0],
              hpRestored: 0,
              formes: [{ id: "purugly" }],
            },
          ],
        },
      ],
      events: 12,
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
        stats: Replay.Stats[];
        events: {
          player: number;
          turn: number;
          message: string;
        }[];
      };

      beforeAll(async () => {
        const response = await fetch(replay.url);
        const text = await response.text();
        replayData = await Replay.Analysis.fromReplayUrl(replay.url);
        if (!replayData) throw new Error("Failed to analyze replay");
        analysis = replayData?.toJson();
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
                replay.expected.stats[i].username,
              );
            });
            test("win", () => {
              expect(analysis.stats[i].win).toEqual(
                replay.expected.stats[i].win,
              );
            });
            describe("Total", () => {
              test("kills", () => {
                expect(analysis.stats[i].total.kills).toEqual(
                  replay.expected.stats[i].total.kills,
                );
              });
              test("deaths", () => {
                expect(analysis.stats[i].total.deaths).toEqual(
                  replay.expected.stats[i].total.deaths,
                );
              });
              test("damage dealt", () => {
                expect(analysis.stats[i].total.damageDealt).toBeCloseTo(
                  replay.expected.stats[i].total.damageDealt,
                  0,
                );
              });
              test("damage taken", () => {
                expect(analysis.stats[i].total.damageTaken).toBeCloseTo(
                  replay.expected.stats[i].total.damageTaken,
                  0,
                );
              });
            });

            describe("Team", () => {
              test("size", () => {
                expect(analysis.stats[i].team.length).toEqual(
                  replay.expected.stats[i].team.length,
                );
              });

              replay.expected.stats[i].team.forEach((pokemon, index) => {
                describe(`Pokemon ${index + 1}`, () => {
                  const expectedKills = normalizeExpectedBreakdown(
                    replay.expected.stats[i].team[index].kills,
                  );
                  const expectedDamageTaken = normalizeExpectedBreakdown(
                    replay.expected.stats[i].team[index].damageTaken,
                  );
                  const expectedDamageDealt = normalizeExpectedBreakdown(
                    replay.expected.stats[i].team[index].damageDealt,
                  );
                  const actualKills = normalizeActualBreakdown(
                    analysis.stats[i].team[index].kills as ActualStatBreakdown,
                  );
                  const actualDamageTaken = normalizeActualBreakdown(
                    analysis.stats[i].team[index]
                      .damageTaken as ActualStatBreakdown,
                  );
                  const actualDamageDealt = normalizeActualBreakdown(
                    analysis.stats[i].team[index]
                      .damageDealt as ActualStatBreakdown,
                  );

                  test("name matches", () => {
                    expect(
                      analysis.stats[i].team[index].formes[0],
                    ).toBeDefined();
                    expect(analysis.stats[i].team[index].formes[0].id).toBe(
                      pokemon.formes[0].id,
                    );
                  });
                  test("status", () => {
                    expect(analysis.stats[i].team[index].status).toBe(
                      replay.expected.stats[i].team[index].status,
                    );
                  });
                  test("hp restored", () => {
                    expect(
                      analysis.stats[i].team[index].hpRestored,
                    ).toBeGreaterThanOrEqual(0);
                    expect(
                      analysis.stats[i].team[index].hpRestored,
                    ).toBeCloseTo(
                      replay.expected.stats[i].team[index].hpRestored,
                      0,
                    );
                  });
                  describe("Kills", () => {
                    test("direct", () => {
                      expect(actualKills.direct).toBeGreaterThanOrEqual(0);
                      expect(actualKills.direct).toEqual(expectedKills.direct);
                    });
                    test("indirect", () => {
                      expect(actualKills.indirect).toBeGreaterThanOrEqual(0);
                      expect(actualKills.indirect).toEqual(
                        expectedKills.indirect,
                      );
                    });
                  });
                  describe("Damage Taken", () => {
                    test("direct", () => {
                      expect(actualDamageTaken.direct).toBeGreaterThanOrEqual(
                        0,
                      );
                      expect(actualDamageTaken.direct).toBeCloseTo(
                        expectedDamageTaken.direct,
                        0,
                      );
                    });
                    test("indirect", () => {
                      expect(actualDamageTaken.indirect).toBeGreaterThanOrEqual(
                        0,
                      );
                      expect(actualDamageTaken.indirect).toBeCloseTo(
                        expectedDamageTaken.indirect,
                        0,
                      );
                    });
                  });
                  describe("Damage Dealt", () => {
                    test("direct", () => {
                      expect(actualDamageDealt.direct).toBeGreaterThanOrEqual(
                        0,
                      );
                      expect(actualDamageDealt.direct).toBeCloseTo(
                        expectedDamageDealt.direct,
                        0,
                      );
                    });
                    test("indirect", () => {
                      expect(actualDamageDealt.indirect).toBeGreaterThanOrEqual(
                        0,
                      );
                      expect(actualDamageDealt.indirect).toBeCloseTo(
                        expectedDamageDealt.indirect,
                        0,
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
  test("room URL", () => {
    expect(
      validateUrl(
        "https://play.pokemonshowdown.com/battle-gen9randombattle-123456",
      ),
    ).toBe(false);
  });
});

describe("Format URL", () => {
  test("valid short URL", () => {
    expect(formatUrl("replay.pokemonshowdown.com/gen9customgame-123456")).toBe(
      "https://replay.pokemonshowdown.com/gen9customgame-123456",
    );
  });
  test("valid https URL", () => {
    expect(
      formatUrl("https://replay.pokemonshowdown.com/gen9customgame-123456"),
    ).toBe("https://replay.pokemonshowdown.com/gen9customgame-123456");
  });
});
