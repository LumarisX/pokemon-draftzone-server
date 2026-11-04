import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import {
  ReplayAnalysisService,
  ReplayAnalysisResult,
} from "./replay-analysis.service";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((file) => file.endsWith(".log"))
  .sort();

function runPipeline(log: string) {
  const parsed = new ReplayParseService().parse(log);
  const built = new ReplayStatesService().build(parsed);
  const analysis = new ReplayAnalysisService().analyze(built);
  return { parsed, built, analysis };
}

function runFixture(fixtureName: string) {
  return runPipeline(readFileSync(join(FIXTURES_DIR, fixtureName), "utf8"));
}

function battleLog(lines: string[]): string {
  return [
    "|gametype|singles",
    "|player|p1|Alice||",
    "|player|p2|Bob||",
    "|gen|9",
    ...lines,
  ].join("\n");
}

function teamRows(analysis: ReplayAnalysisResult, username: string) {
  const player = analysis.players.find((p) => p.username === username);
  return Object.fromEntries(
    (player?.team ?? []).map((mon) => [
      mon.id,
      {
        status: mon.status,
        direct: mon.kills.direct,
        indirect: mon.kills.indirect,
      },
    ]),
  );
}

function faintMessages(analysis: ReplayAnalysisResult): string[] {
  return analysis.events
    .filter((event) => event.message.includes("fainted"))
    .map((event) => `T${event.turn} ${event.message}`);
}

describe("replay analyzer pipeline", () => {
  describe.each(fixtureNames)("%s", (fixtureName) => {
    const log = readFileSync(join(FIXTURES_DIR, fixtureName), "utf8");
    let analysis: ReplayAnalysisResult;
    let parsed: ReturnType<ReplayParseService["parse"]>;
    let built: ReturnType<ReplayStatesService["build"]>;

    beforeAll(() => {
      ({ parsed, built, analysis } = runPipeline(log));
    });

    it("handles every protocol line without unknown actions or handler errors", () => {
      expect(parsed.unknownActions).toEqual({});
      expect(built.warnings).toEqual([]);
    });

    it("keeps aggregate stats internally consistent", () => {
      const totalKills = analysis.players.reduce(
        (sum, player) => sum + player.total.kills,
        0,
      );
      const totalDeaths = analysis.players.reduce(
        (sum, player) => sum + player.total.deaths,
        0,
      );
      expect(totalKills).toBeLessThanOrEqual(totalDeaths);

      analysis.players.forEach((player) => {
        [player.luck.moves, player.luck.crits].forEach((luck) => {
          expect(luck.hits).toBeLessThanOrEqual(luck.total);
          expect(luck.expected).toBeGreaterThanOrEqual(0);
          expect(luck.expected).toBeLessThanOrEqual(1);
          expect(luck.actual).toBeGreaterThanOrEqual(0);
          expect(luck.actual).toBeLessThanOrEqual(1);
        });
        player.team.forEach((mon) => {
          [mon.damageDealt, mon.damageTaken, mon.kills].forEach(
            (breakdown) => {
              expect(breakdown.direct).toBeGreaterThanOrEqual(0);
              expect(breakdown.indirect).toBeGreaterThanOrEqual(0);
              expect(breakdown.teammate).toBeGreaterThanOrEqual(0);
            },
          );
          expect(mon.hpRestored).toBeGreaterThanOrEqual(0);
        });
      });

      const faintEvents = analysis.events.filter((event) =>
        event.message.includes("fainted"),
      );
      expect(faintEvents.length).toBe(totalDeaths);
    });

    it("matches the golden analysis snapshot", () => {
      expect(analysis).toMatchSnapshot();
    });

    it("matches the golden parse-warnings snapshot", () => {
      expect(parsed.argValidationWarnings).toMatchSnapshot();
    });
  });

  describe("Pokémon that share a nickname", () => {
    it("credits each one with its own kills and faint", () => {
      const { analysis } = runFixture(
        "gen9terapreviewnatdexdraft-2166687090.log",
      );

      expect(teamRows(analysis, "xbeatrizz")).toEqual({
        kyurem: { status: "fainted", direct: 1, indirect: 0 },
        slowkinggalar: { status: "survived", direct: 0, indirect: 1 },
        sandyshocks: { status: "fainted", direct: 1, indirect: 0 },
        hariyama: { status: "fainted", direct: 0, indirect: 0 },
        archeops: { status: "survived", direct: 3, indirect: 0 },
        samurotthisui: { status: "fainted", direct: 0, indirect: 0 },
      });
      expect(faintMessages(analysis)).toEqual(
        expect.arrayContaining([
          "T6 TeravoltKB's Thundurus-Therian fainted from Freeze-Dry by xbeatrizz's Kyurem.",
          "T11 xbeatrizz's Kyurem fainted from Flip Turn by TeravoltKB's Alomomola.",
          "T13 xbeatrizz's Hariyama fainted from Body Press by TeravoltKB's Aggron-Mega.",
          "T14 TeravoltKB's Aggron-Mega fainted from Earth Power by xbeatrizz's Sandy Shocks.",
          "T25 TeravoltKB's Tangrowth fainted from Dual Wingbeat by xbeatrizz's Archeops.",
        ]),
      );
    });

    it("keeps them apart when there is no team preview", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: BUG|Kyurem|100/100",
          "|switch|p2a: Foe|Hariyama, F|100/100",
          "|turn|1",
          "|switch|p1a: BUG|Archeops, F|100/100",
          "|turn|2",
        ]),
      );

      expect(Object.keys(built.field.sides.p1.pokemon).sort()).toEqual([
        "p1: archeops",
        "p1: kyurem",
      ]);
    });

    it("resolves a positionless reference to the one on the field", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Attacker|Tornadus|100/100",
          "|switch|p2a: BUG|Kyurem|100/100",
          "|turn|1",
          "|switch|p2a: BUG|Archeops, F|100/100",
          "|move|p1a: Attacker|Dual Wingbeat|p2a: BUG",
          "|-damage|p2a: BUG|80/100",
          "|-damage|p2a: BUG|60/100",
          "|-hitcount|p2: BUG|2",
          "|turn|2",
        ]),
      );

      const attacker = built.field.sides.p1.pokemon["p1: tornadus"];
      expect(new Set(attacker.critHistory.map((crit) => crit.target))).toEqual(
        new Set(["p2: archeops"]),
      );
    });

    it("does not confuse a nickname with another Pokémon's species", () => {
      const { built } = runPipeline(
        battleLog([
          "|clearpoke",
          "|poke|p1|Kyurem|",
          "|poke|p1|Archeops, F|",
          "|poke|p2|Hariyama, F|",
          "|teampreview",
          "|start",
          "|switch|p1a: kyurem|Archeops, F|100/100",
          "|switch|p2a: Foe|Hariyama, F|100/100",
          "|turn|1",
          "|move|p2a: Foe|Close Combat|p1a: kyurem",
          "|-damage|p1a: kyurem|40/100",
          "|turn|2",
        ]),
      );

      const side = built.field.sides.p1.pokemon;
      expect(side["p1: archeops"].hp.percent).toBe(40);
      expect(side["p1: kyurem"].hp.percent).toBe(100);
      expect(side["p1: kyurem"].everActive).toBeUndefined();
    });
  });

  describe("forme changes", () => {
    it("keeps a mega unknown to the dex on one row across switches", () => {
      const { built } = runPipeline(
        battleLog([
          "|clearpoke",
          "|poke|p1|Madeupmon|",
          "|poke|p1|Kyurem|",
          "|poke|p2|Hariyama, F|",
          "|teampreview",
          "|start",
          "|switch|p1a: Bob|Madeupmon|100/100",
          "|switch|p2a: Foe|Hariyama, F|100/100",
          "|turn|1",
          "|detailschange|p1a: Bob|Madeupmon-Mega",
          "|-mega|p1a: Bob|Madeupmon|Madeupite",
          "|turn|2",
          "|switch|p1a: Other|Kyurem|100/100",
          "|turn|3",
          "|switch|p1a: Bob|Madeupmon-Mega|100/100",
          "|turn|4",
        ]),
      );

      expect(Object.keys(built.field.sides.p1.pokemon).sort()).toEqual([
        "p1: kyurem",
        "p1: madeupmon",
      ]);
    });
  });

  describe("Champions HP color suffixes", () => {
    it("credits the kill to the move that landed it after a 50/100g switch-in", () => {
      const { analysis } = runFixture(
        "gen9championsnatdexdraft-2699141555.log",
      );

      expect(faintMessages(analysis)).toContain(
        "T23 flamestunt's Cinderace fainted from Tera Starstorm by Mr. Unsuccessful's Terapagos-Terastal.",
      );
      expect(teamRows(analysis, "Mr. Unsuccessful")).toMatchObject({
        scizor: { direct: 0 },
        terapagosterastal: { direct: 5 },
      });
    });

    it.each(["50/100g", "50/100y", "20/100y", "20/100r"])(
      "reads %s as a real percentage",
      (hp) => {
        const percent = Number(hp.split("/")[0]);
        const { built } = runPipeline(
          battleLog([
            "|start",
            "|switch|p1a: Attacker|Tornadus|100/100",
            "|switch|p2a: Target|Kyurem|100/100",
            "|turn|1",
            "|move|p1a: Attacker|Hurricane|p2a: Target",
            `|-damage|p2a: Target|${hp}`,
            "|turn|2",
            "|move|p1a: Attacker|Hurricane|p2a: Target",
            "|-damage|p2a: Target|10/100",
            "|turn|3",
          ]),
        );

        const target = built.field.sides.p2.pokemon["p2: kyurem"];
        expect(target.damageHistory.map((hit) => hit.hpAfter)).toEqual([
          percent,
          10,
        ]);
        expect(target.damageHistory[0].damageTaken).toBe(100 - percent);
      },
    );

    it("counts a heal that lands on a suffixed value", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Attacker|Tornadus|100/100",
          "|switch|p2a: Target|Kyurem|30/100",
          "|turn|1",
          "|",
          "|-heal|p2a: Target|50/100g|[from] item: Leftovers",
          "|turn|2",
        ]),
      );

      const target = built.field.sides.p2.pokemon["p2: kyurem"];
      expect(target.healHistory.map((heal) => heal.amount)).toEqual([20]);
      expect(target.hp.percent).toBe(50);
    });

    it("keeps a switch-in's real HP in the turn snapshot", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Attacker|Tornadus|100/100",
          "|switch|p2a: Target|Kyurem|50/100g",
          "|turn|1",
        ]),
      );

      const firstTurn = built.turns.find((turn) => turn.turnNumber === 0);
      expect(firstTurn?.sides.p2["p2: kyurem"].hpPercent).toBe(50);
    });

    it("still reads a fainted Pokémon as zero", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Attacker|Tornadus|100/100",
          "|switch|p2a: Target|Kyurem|50/100g",
          "|turn|1",
          "|move|p1a: Attacker|Hurricane|p2a: Target",
          "|-damage|p2a: Target|0 fnt",
          "|faint|p2a: Target",
          "|turn|2",
        ]),
      );

      const target = built.field.sides.p2.pokemon["p2: kyurem"];
      expect(target.hp.percent).toBe(0);
      expect(target.damageHistory.at(-1)?.damageTaken).toBe(50);
      expect(target.fainted?.attackerPokemon).toBe("p1: tornadus");
      expect(target.fainted?.move).toBe("Hurricane");
    });
  });

  describe("trap moves", () => {
    it("credits the kill and chip damage to the trapper in a real game", () => {
      const { built, analysis } = runFixture("gen9natdexdraft-2708961288.log");

      const mew = built.field.sides.p1.pokemon["p1: mew"];
      expect(mew.faints[0].attackerPokemon).toBe("p2: cradily");
      expect(mew.faints[0].cause).toBe("Infestation");
      expect(mew.faints[0].indirect).toBe(true);
      expect(mew.damageHistory.at(-1)?.attacker).toBe("p2: cradily");

      const username = analysis.players[1].username;
      expect(teamRows(analysis, username).cradily.indirect).toBeGreaterThan(0);
    });

    it("credits a trapper named by [of] on every tick", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Target|Kyurem|100/100",
          "|switch|p2a: Trapper|Heatran|100/100",
          "|turn|1",
          "|move|p2a: Trapper|Magma Storm|p1a: Target",
          "|-damage|p1a: Target|70/100",
          "|-activate|p1a: Target|move: Magma Storm|[of] p2a: Trapper",
          "|",
          "|-damage|p1a: Target|60/100|[from] move: Magma Storm|[partiallytrapped]",
          "|turn|2",
          "|",
          "|-damage|p1a: Target|0 fnt|[from] move: Magma Storm|[partiallytrapped]",
          "|faint|p1a: Target",
          "|turn|3",
        ]),
      );

      const target = built.field.sides.p1.pokemon["p1: kyurem"];
      expect(target.damageHistory.map((hit) => hit.attacker)).toEqual([
        "p2: heatran",
        "p2: heatran",
        "p2: heatran",
      ]);
      expect(target.faints[0].attackerPokemon).toBe("p2: heatran");
    });

    it("stops tracking the trap once it ends", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Target|Kyurem|100/100",
          "|switch|p2a: Trapper|Heatran|100/100",
          "|turn|1",
          "|move|p2a: Trapper|Whirlpool|p1a: Target",
          "|-activate|p1a: Target|move: Whirlpool|[of] p2a: Trapper",
          "|",
          "|-end|p1a: Target|Whirlpool|[partiallytrapped]",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p1.positions.a.conditions).toEqual([]);
    });

    it("does not treat other activations as a trap", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Target|Kyurem|100/100",
          "|switch|p2a: Attacker|Heatran|100/100",
          "|turn|1",
          "|move|p2a: Attacker|Flamethrower|p1a: Target",
          "|-activate|p1a: Target|move: Protect",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p1.positions.a.conditions).toEqual([]);
    });
  });

  describe("status from a move that hits back", () => {
    const opening = [
      "|start",
      "|switch|p1a: Defender|Toxapex|100/100",
      "|switch|p2a: Attacker|Garchomp|100/100",
      "|turn|1",
      "|",
    ];

    it("credits a Baneful Bunker poison kill to the Bunker user", () => {
      const { built, analysis } = runPipeline(
        battleLog([
          ...opening,
          "|move|p1a: Defender|Baneful Bunker|p1a: Defender",
          "|-singleturn|p1a: Defender|move: Protect",
          "|move|p2a: Attacker|Close Combat|p1a: Defender",
          "|-activate|p1a: Defender|move: Protect",
          "|-status|p2a: Attacker|psn",
          "|",
          "|-damage|p2a: Attacker|0 fnt|[from] psn",
          "|faint|p2a: Attacker",
          "|turn|2",
        ]),
      );

      const attacker = built.field.sides.p2.pokemon["p2: garchomp"];
      expect(attacker.status?.setter).toBe("p1: toxapex");
      expect(attacker.faints[0].attackerPokemon).toBe("p1: toxapex");
      expect(attacker.damageHistory[0].selfInflicted).toBe(false);
      expect(teamRows(analysis, "Alice").toxapex.indirect).toBe(1);
    });

    it("credits the one that blocked a spread move, not the declared target", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Other|Kyurem|100/100",
          "|switch|p1b: Defender|Toxapex|100/100",
          "|switch|p2a: Attacker|Garchomp|100/100",
          "|turn|1",
          "|",
          "|move|p1b: Defender|Baneful Bunker|p1b: Defender",
          "|-singleturn|p1b: Defender|move: Protect",
          "|move|p2a: Attacker|Breaking Swipe|p1a: Other|[spread] p1a,p1b",
          "|-activate|p1b: Defender|move: Protect",
          "|-status|p2a: Attacker|psn",
          "|-damage|p1a: Other|80/100",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p2.pokemon["p2: garchomp"].status?.setter).toBe(
        "p1: toxapex",
      );
    });

    it("credits a Beak Blast burn to the move's target", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|move|p2a: Attacker|Close Combat|p1a: Defender",
          "|-damage|p1a: Defender|60/100",
          "|-status|p2a: Attacker|brn",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p2.pokemon["p2: garchomp"].status?.setter).toBe(
        "p1: toxapex",
      );
    });

    it("still credits an ordinary status move to its user", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|move|p1a: Defender|Toxic|p2a: Attacker",
          "|-status|p2a: Attacker|tox",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p2.pokemon["p2: garchomp"].status?.setter).toBe(
        "p1: toxapex",
      );
    });

    it("still treats an orb as self-inflicted", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|",
          "|-status|p2a: Attacker|tox|[from] item: Toxic Orb",
          "|turn|2",
        ]),
      );

      expect(built.field.sides.p2.pokemon["p2: garchomp"].status?.setter).toBe(
        "p2: garchomp",
      );
    });
  });

  describe("two forms of one species on a team", () => {
    function speciesRow(
      built: ReturnType<ReplayStatesService["build"]>,
      species: string,
    ) {
      return Object.values(built.field.sides.p1.pokemon).find((pokemon) =>
        pokemon.speciesHistory.includes(species),
      );
    }

    it("keeps them on separate rows in a real game", () => {
      const { analysis } = runFixture("gen9draft-2708226285.log");

      expect(teamRows(analysis, "practor 007")).toEqual({
        virizion: { status: "fainted", direct: 0, indirect: 0 },
        sandaconda: { status: "fainted", direct: 0, indirect: 2 },
        carbink: { status: "fainted", direct: 0, indirect: 0 },
        dugtrio: { status: "fainted", direct: 0, indirect: 0 },
        dugtrioalola: { status: "fainted", direct: 0, indirect: 0 },
        sandslash: { status: "fainted", direct: 0, indirect: 0 },
      });
    });

    it.each([
      ["regional form first", ["Dugtrio-Alola, F", "Dugtrio, M"]],
      ["base form first", ["Dugtrio, M", "Dugtrio-Alola, F"]],
    ])("sends damage to the right one with the %s", (_name, order) => {
      const { built } = runPipeline(
        battleLog([
          "|clearpoke",
          `|poke|p1|${order[0]}|`,
          `|poke|p1|${order[1]}|`,
          "|poke|p2|Garchomp, M|",
          "|teampreview",
          "|start",
          "|switch|p1a: Dugtrio|Dugtrio-Alola, F|100/100",
          "|switch|p2a: Foe|Garchomp, M|100/100",
          "|turn|1",
          "|move|p2a: Foe|Earthquake|p1a: Dugtrio",
          "|-damage|p1a: Dugtrio|0 fnt",
          "|faint|p1a: Dugtrio",
          "|",
          "|switch|p1a: Dugtrio|Dugtrio, M|100/100",
          "|turn|2",
          "|move|p2a: Foe|Earthquake|p1a: Dugtrio",
          "|-damage|p1a: Dugtrio|40/100",
          "|turn|3",
        ]),
      );

      expect(speciesRow(built, "dugtrioalola")?.fainted).toBeDefined();
      expect(speciesRow(built, "dugtrio")?.fainted).toBeUndefined();
      expect(speciesRow(built, "dugtrio")?.hp.percent).toBe(40);
      expect(speciesRow(built, "dugtrio")?.key).not.toBe(
        speciesRow(built, "dugtrioalola")?.key,
      );
    });

    it("keeps a mega with the form that evolved", () => {
      const { built } = runPipeline(
        battleLog([
          "|clearpoke",
          "|poke|p1|Slowbro, M|",
          "|poke|p1|Slowbro-Galar, M|",
          "|poke|p2|Garchomp, M|",
          "|teampreview",
          "|start",
          "|switch|p1a: Bro|Slowbro, M|100/100",
          "|switch|p2a: Foe|Garchomp, M|100/100",
          "|turn|1",
          "|detailschange|p1a: Bro|Slowbro-Mega, M",
          "|-mega|p1a: Bro|Slowbro|Slowbronite",
          "|turn|2",
          "|switch|p1a: Bro|Slowbro-Galar, M|100/100",
          "|turn|3",
          "|switch|p1a: Bro|Slowbro-Mega, M|100/100",
          "|turn|4",
        ]),
      );

      expect(Object.keys(built.field.sides.p1.pokemon)).toHaveLength(2);
      expect(speciesRow(built, "slowbromega")?.speciesHistory).toEqual([
        "slowbro",
        "slowbromega",
      ]);
      expect(speciesRow(built, "slowbrogalar")?.speciesHistory).toEqual([
        "slowbrogalar",
      ]);
    });
  });

  describe("Court Change", () => {
    const opening = [
      "|start",
      "|switch|p1a: Setter|Tinkaton|100/100",
      "|switch|p2a: Changer|Cinderace|100/100",
      "|turn|1",
      "|move|p1a: Setter|Stealth Rock|p2a: Changer",
      "|-sidestart|p2: Bob|move: Stealth Rock",
      "|turn|2",
      "|move|p2a: Changer|Court Change|p2a: Changer",
      "|-swapsideconditions",
      "|-activate|p2a: Changer|move: Court Change",
      "|turn|3",
    ];

    it("credits a swapped hazard's KO to the original setter as a teammate KO", () => {
      const { built, analysis } = runFixture(
        "gen9natdexdraft-2707838957.log",
      );

      const lopunny = built.field.sides.p1.pokemon["p1: lopunny"];
      expect(lopunny.faints[0].attackerPokemon).toBe("p1: miltank");
      expect(lopunny.faints[0].cause).toBe("Stealth Rock");
      const miltank = analysis.players[0].team.find(
        (row) => row.id === "miltank",
      );
      expect(miltank?.kills.teammate).toBeGreaterThan(0);
    });

    it("credits poison from swapped Toxic Spikes to the original setter", () => {
      const { built } = runFixture("gen8draft-2667856727.log");

      const krookodile = built.field.sides.p1.pokemon["p1: krookodile"];
      expect(krookodile.status?.setter).toBe("p1: drapion");
      expect(krookodile.faints[0].attackerPokemon).toBe("p1: drapion");
    });

    it("moves hazards to the other side", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|switch|p1a: Other|Kyurem|100/100",
          "|-damage|p1a: Other|88/100|[from] Stealth Rock",
          "|turn|4",
        ]),
      );

      expect(built.field.sides.p2.conditions).toEqual([]);
      expect(built.field.sides.p1.conditions.map((c) => c.id)).toEqual([
        "stealthrock",
      ]);
      const hit = built.field.sides.p1.pokemon["p1: kyurem"].damageHistory[0];
      expect(hit.attacker).toBe("p1: tinkaton");
      expect(hit.friendlyFire).toBe(true);
    });

    it("swaps both directions at once", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Setter|Tinkaton|100/100",
          "|switch|p2a: Changer|Cinderace|100/100",
          "|turn|1",
          "|move|p1a: Setter|Stealth Rock|p2a: Changer",
          "|-sidestart|p2: Bob|move: Stealth Rock",
          "|move|p2a: Changer|Spikes|p1a: Setter",
          "|-sidestart|p1: Alice|Spikes",
          "|turn|2",
          "|move|p2a: Changer|Court Change|p2a: Changer",
          "|-swapsideconditions",
          "|turn|3",
        ]),
      );

      expect(built.field.sides.p1.conditions.map((c) => c.id)).toEqual([
        "stealthrock",
      ]);
      expect(built.field.sides.p2.conditions.map((c) => c.id)).toEqual([
        "spikes",
      ]);
    });

    it.each([
      ["Future Sight", "move: Future Sight"],
      ["Doom Desire", "Doom Desire"],
    ])("leaves a pending %s where it was", (move, startEffect) => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Setter|Jirachi|100/100",
          "|switch|p2a: Changer|Cinderace|100/100",
          "|turn|1",
          `|move|p1a: Setter|${move}|p2a: Changer`,
          `|-start|p1a: Setter|${startEffect}`,
          "|turn|2",
          "|move|p2a: Changer|Court Change|p2a: Changer",
          "|-swapsideconditions",
          "|turn|3",
          "|",
          `|-end|p2a: Changer|move: ${move}`,
          "|-damage|p2a: Changer|40/100",
          "|turn|4",
        ]),
      );

      const hit = built.field.sides.p2.pokemon["p2: cinderace"].damageHistory[0];
      expect(hit.attacker).toBe("p1: jirachi");
      expect(hit.cause).toBe(move);
    });
  });

  describe("Doom Desire", () => {
    it("credits the kill to its user in a real game", () => {
      const { built } = runFixture("gen9terapreviewnatdexdraft-2185176600.log");

      const melmetal = built.field.sides.p1.pokemon["p1: melmetal"];
      expect(melmetal.faints[0].attackerSideId).toBe("p2");
      expect(melmetal.faints[0].attackerPokemon).toBeDefined();
      expect(melmetal.faints[0].cause).toBe("Doom Desire");
      expect(melmetal.faints[0].indirect).toBe(false);
    });

    it("still credits the user after it has switched out", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Setter|Jirachi|100/100",
          "|switch|p2a: Target|Kyurem|100/100",
          "|turn|1",
          "|move|p1a: Setter|Doom Desire|p2a: Target",
          "|-start|p1a: Setter|Doom Desire",
          "|turn|2",
          "|switch|p1a: Other|Garchomp|100/100",
          "|turn|3",
          "|",
          "|-end|p2a: Target|move: Doom Desire",
          "|-damage|p2a: Target|0 fnt",
          "|faint|p2a: Target",
          "|turn|4",
        ]),
      );

      const target = built.field.sides.p2.pokemon["p2: kyurem"];
      expect(target.faints[0].attackerPokemon).toBe("p1: jirachi");
    });
  });

  describe("multi-hit moves that break Disguise", () => {
    it("credits the kill to the attacker in a real game", () => {
      const { built } = runFixture("gen9natdexdraft-2707785944.log");

      const mimikyu = built.field.sides.p1.pokemon["p1: mimikyu"];
      expect(mimikyu.faints[0].attackerPokemon).toBe("p2: sneasel");
      expect(mimikyu.faints[0].move).toBe("Triple Axel");
    });

    it("keeps later hits on the move but not Disguise's own damage", () => {
      const { built } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: Mimikyu|Mimikyu|100/100",
          "|switch|p2a: Foe|Weavile|100/100",
          "|turn|1",
          "|move|p2a: Foe|Triple Axel|p1a: Mimikyu",
          "|-activate|p1a: Mimikyu|ability: Disguise",
          "|detailschange|p1a: Mimikyu|Mimikyu-Busted",
          "|-damage|p1a: Mimikyu|88/100|[from] pokemon: Mimikyu-Busted",
          "|-damage|p1a: Mimikyu|50/100",
          "|-damage|p1a: Mimikyu|0 fnt",
          "|-hitcount|p1: Mimikyu|3",
          "|faint|p1a: Mimikyu",
          "|turn|2",
        ]),
      );

      const mimikyu = built.field.sides.p1.pokemon["p1: mimikyu"];
      expect(mimikyu.damageHistory.map((hit) => hit.attacker)).toEqual([
        undefined,
        "p2: weavile",
        "p2: weavile",
      ]);
      expect(mimikyu.species).toBe("mimikyubusted");
      expect(mimikyu.faints[0].attackerPokemon).toBe("p2: weavile");
    });

    it("does not pull a later forme change into an earlier move", () => {
      const parsed = new ReplayParseService().parse(
        battleLog([
          "|start",
          "|switch|p1a: Mon|Charizard|100/100",
          "|switch|p2a: Foe|Weavile|100/100",
          "|turn|1",
          "|",
          "|detailschange|p1a: Mon|Charizard-Mega-X",
          "|-mega|p1a: Mon|Charizard|Charizardite X",
          "|turn|2",
        ]),
      );

      const lines = parsed.turns.find((turn) => turn.number === 1)?.lines ?? [];
      expect(lines.map((line) => line.action)).toEqual(["", "detailschange"]);
    });
  });

  describe("self-KO moves", () => {
    const opening = [
      "|start",
      "|switch|p1a: Bunker|Toxapex|100/100",
      "|switch|p2a: User|Flutter Mane|100/100",
      "|turn|1",
      "|move|p1a: Bunker|Toxic|p2a: User",
      "|-status|p2a: User|tox",
      "|turn|2",
      "|",
    ];

    it("does not call a poison KO a self-KO after a blocked Memento in a real game", () => {
      const { built } = runFixture("gen94v4doublesdraft-2703066220.log");

      const flutterMane = built.field.sides.p2.pokemon["p2: fluttermane"];
      expect(flutterMane.faints[0].cause).toBe("Poison");
      expect(flutterMane.faints[0].attackerPokemon).toBe("p1: toxapex");
    });

    it("credits the poisoner when Memento was blocked that turn", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|move|p1a: Bunker|Baneful Bunker|p1a: Bunker",
          "|-singleturn|p1a: Bunker|move: Protect",
          "|move|p2a: User|Memento|p1a: Bunker",
          "|-activate|p1a: Bunker|move: Protect",
          "|",
          "|-damage|p2a: User|0 fnt|[from] psn",
          "|faint|p2a: User",
          "|turn|3",
        ]),
      );

      const user = built.field.sides.p2.pokemon["p2: fluttermane"];
      expect(user.faints[0].sourceAction).toBe("faint");
      expect(user.faints[0].attackerPokemon).toBe("p1: toxapex");
    });

    it("still reads a landed Memento as a self-KO", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|move|p2a: User|Memento|p1a: Bunker",
          "|-unboost|p1a: Bunker|atk|2",
          "|faint|p2a: User",
          "|turn|3",
        ]),
      );

      const user = built.field.sides.p2.pokemon["p2: fluttermane"];
      expect(user.faints[0].sourceAction).toBe("selfdestruct");
      expect(user.faints[0].cause).toBe("Memento");
    });

    it("still reads Explosion as a self-KO after taking a hit that turn", () => {
      const { built } = runPipeline(
        battleLog([
          ...opening,
          "|move|p1a: Bunker|Scald|p2a: User",
          "|-damage|p2a: User|40/100",
          "|move|p2a: User|Explosion|p1a: Bunker",
          "|-damage|p1a: Bunker|20/100",
          "|faint|p2a: User",
          "|turn|3",
        ]),
      );

      const user = built.field.sides.p2.pokemon["p2: fluttermane"];
      expect(user.faints[0].sourceAction).toBe("selfdestruct");
      expect(user.faints[0].cause).toBe("Explosion");
    });

    it.each([
      ["Steel Beam", "steelbeam"],
      ["Mind Blown", "mindblown"],
    ])("marks %s self-inflicted when it follows the target's faint", (move, tag) => {
      const { built, analysis } = runPipeline(
        battleLog([
          "|start",
          "|switch|p1a: User|Tinkaton|100/100",
          "|switch|p2a: Target|Kyurem|100/100",
          "|turn|1",
          `|move|p1a: User|${move}|p2a: Target`,
          "|-damage|p2a: Target|0 fnt",
          "|faint|p2a: Target",
          `|-damage|p1a: User|0 fnt|[from] ${tag}`,
          "|faint|p1a: User",
          "|turn|2",
        ]),
      );

      const user = built.field.sides.p1.pokemon["p1: tinkaton"];
      expect(user.damageHistory[0].selfInflicted).toBe(true);
      const selfKo = analysis.kos.find((ko) => ko.victim.id === "tinkaton");
      expect(selfKo?.self).toBe(true);
      expect(selfKo?.cause).toBe(move);
    });
  });

  describe("log lines with no bearing on the battle", () => {
    function parseLines(lines: string[]) {
      return new ReplayParseService().parse(battleLog(["|start", ...lines]));
    }

    it("ignores plain text lines", () => {
      const parsed = parseLines([
        "Alice rejected open team sheets.",
        "'mega absol z' has no exact match. Approximate match:",
        "|turn|1",
      ]);

      expect(parsed.unknownActions).toEqual({});
    });

    it("recognizes -ohko, badge and chat", () => {
      const parsed = parseLines([
        "|badge|p2|bronze|gen9randombattle|100-9",
        "|chat|Alice|hello",
        "|turn|1",
        "|",
        "|-ohko",
      ]);

      expect(parsed.unknownActions).toEqual({});
      expect(parsed.argValidationWarnings).toEqual([]);
    });

    it("does not warn about name changes or pipes in chat", () => {
      const parsed = parseLines([
        "|n| Alice|alice2",
        "|c| Alice|yes :|",
        "|raw|<b>a|b</b>",
        "|turn|1",
      ]);

      expect(parsed.argValidationWarnings).toEqual([]);
    });

    it.each([
      ["[from]lockedmove", "lockedmove"],
      ["[from] lockedmove", "lockedmove"],
      ["[from]move: Sleep Talk", "move: Sleep Talk"],
      ["[from]ability: Magic Bounce", "ability: Magic Bounce"],
    ])("reads the tag %s", (tag, expected) => {
      const parsed = parseLines([
        "|turn|1",
        `|move|p1a: Mon|Outrage|p2a: Foe|${tag}`,
        "|turn|2",
      ]);

      const move = parsed.turns
        .flatMap((turn) => turn.lines)
        .find((line) => line.action === "move");
      expect(move?.args.from).toBe(expected);
      expect(parsed.argValidationWarnings).toEqual([]);
    });
  });
});
