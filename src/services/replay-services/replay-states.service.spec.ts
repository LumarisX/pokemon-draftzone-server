import fs from "fs";
import path from "path";

import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";

describe("ReplayStatesService", () => {
  const parseService = new ReplayParseService();
  const replayStatesService = new ReplayStatesService();

  it("builds cumulative state for each turn", () => {
    const parsed = parseService.parse(
      `
|player|p1|Alice
|player|p2|Bob
|teamsize|p1|6
|teamsize|p2|6
|poke|p1|Pikachu, M|
|poke|p2|Bulbasaur, M|
|switch|p1a: Sparky|Pikachu, M|100/100
|switch|p2a: Leafy|Bulbasaur, M|100/100
|turn|1
|move|p1a: Sparky|Thunderbolt|p2a: Leafy
|-damage|p2a: Leafy|30/100 par
|turn|2
|move|p2a: Leafy|Synthesis|p2a: Leafy
|-heal|p2a: Leafy|50/100 par
|faint|p1a: Sparky
|win|Bob
`.trim(),
    );

    const turnStates = replayStatesService.build(parsed);

    expect(turnStates.map((state) => state.turnNumber)).toEqual([0, 1, 2]);

    const turn1Field = turnStates.find(
      (state) => state.turnNumber === 1,
    )?.field;
    expect(turn1Field?.sides.p1.username).toBe("Alice");
    expect(turn1Field?.sides.p2.username).toBe("Bob");

    const turn1P2Active = turn1Field?.sides.p2.positions.a.pokemon;
    expect(turn1P2Active).toBeDefined();
    expect(turn1P2Active?.hp?.current).toBe(30);
    expect(turn1P2Active?.hp?.max).toBe(100);
    expect(turn1P2Active?.status).toBe("par");
    expect(turn1P2Active?.damageHistory).toHaveLength(1);
    expect(turn1P2Active?.damageHistory[0]).toMatchObject({
      turnNumber: 1,
      damageTaken: 70,
      indirect: false,
      attacker: "p1a: Sparky",
      move: "Thunderbolt",
    });

    const turn1P1Active = turn1Field?.sides.p1.positions.a.pokemon;
    expect(turn1P1Active?.moveHistory.thunderbolt).toHaveLength(1);
    expect(turn1P1Active?.moveHistory.thunderbolt?.[0]).toMatchObject({
      turnNumber: 1,
      raw: "Thunderbolt",
      target: "p2a: Leafy",
    });

    const turn2Field = turnStates.find(
      (state) => state.turnNumber === 2,
    )?.field;
    const turn2P2Active = turn2Field?.sides.p2.positions.a.pokemon;
    expect(turn2P2Active?.hp?.current).toBe(50);
    expect(turn2P2Active?.status).toBe("par");

    const turn2P1Active = turn2Field?.sides.p1.positions.a.pokemon;
    expect(turn2P1Active?.fainted).toMatchObject({
      turnNumber: 2,
      sourceAction: "faint",
    });
    expect(turn2P1Active?.status).toBe("fnt");
    expect(turn2Field?.winner).toBe("Bob");
  });

  it("builds per-turn states from real replay logs", () => {
    const replayPath = path.join(
      __dirname,
      "test-replays/gen8draft-2445027050.log",
    );
    const replayLog = fs.readFileSync(replayPath, "utf-8");
    const parsed = parseService.parse(replayLog);

    const turnStates = replayStatesService.build(parsed);
    expect(turnStates.length).toBe(parsed.turns.length);

    const turn5Field = turnStates.find(
      (state) => state.turnNumber === 5,
    )?.field;
    const turn5P1Active = turn5Field?.sides.p1.positions.a.pokemon;
    expect(turn5P1Active?.species).toBe("vaporeon");
    expect(turn5P1Active?.hp?.current).toBe(50);

    const finalField = turnStates[turnStates.length - 1]?.field;
    expect(finalField?.winner).toBe("notagreatrainer");
  });

  it("tracks side condition setter metadata for hazard chip attribution", () => {
    const parsed = parseService.parse(
      `
|player|p1|Alice
|player|p2|Bob
|teamsize|p1|6
|teamsize|p2|6
|poke|p1|Golem, M|
|poke|p2|Pikachu, M|
|switch|p1a: Rocky|Golem, M|100/100
|switch|p2a: Sparky|Pikachu, M|100/100
|turn|1
|move|p1a: Rocky|Stealth Rock|p2a: Sparky
|-sidestart|p2: Bob|move: Stealth Rock
|turn|2
|switch|p2a: Sparky|Pikachu, M|100/100
|-damage|p2a: Sparky|88/100|[from] Stealth Rock
`.trim(),
    );

    const turnStates = replayStatesService.build(parsed);
    const turn1Field = turnStates.find(
      (state) => state.turnNumber === 1,
    )?.field;
    const stealthRock = turn1Field?.sides.p2.conditions.find(
      (condition) => condition.id === "stealthrock",
    );

    expect(stealthRock).toBeDefined();
    expect(stealthRock?.name).toBe("Stealth Rock");
    expect(stealthRock?.setterSideId).toBe("p1");
    expect(stealthRock?.setterPokemon).toBe("p1: golem");
    expect(stealthRock?.sourceMove).toBe("Stealth Rock");

    const turn2Field = turnStates.find(
      (state) => state.turnNumber === 2,
    )?.field;
    const sparky = turn2Field?.sides.p2.positions.a.pokemon;
    const hazardDamage = sparky?.damageHistory.at(-1);

    expect(hazardDamage).toBeDefined();
    expect(hazardDamage?.attackerSideId).toBe("p1");
    expect(hazardDamage?.attacker).toBe("p1: golem");
    expect(hazardDamage?.move).toBe("Stealth Rock");
    expect(hazardDamage?.cause).toBe("Stealth Rock");
    expect(hazardDamage?.indirect).toBe(true);
  });

  it("captures Destiny Bond activation and retaliation context in replay 2549748681", () => {
    const replayPath = path.join(
      __dirname,
      "test-replays/gen9draft-2549748681.log",
    );
    const replayLog = fs.readFileSync(replayPath, "utf-8");
    const parsed = parseService.parse(replayLog);

    const turnStates = replayStatesService.build(parsed);
    const turn20Field = turnStates.find(
      (state) => state.turnNumber === 20,
    )?.field;
    const hoopa = Object.values(turn20Field?.sides.p2.pokemon ?? {}).find(
      (pokemon) => pokemon.nickname === "Astrophysicist",
    );
    const enamorus = Object.values(turn20Field?.sides.p1.pokemon ?? {}).find(
      (pokemon) => pokemon.nickname === "War Tortle",
    );

    expect(enamorus).toBeDefined();
    expect(enamorus?.flags.destinyBond).toBe(hoopa?.key);

    expect(enamorus?.fainted).toMatchObject({
      turnNumber: 20,
      sourceAction: "faint",
      attackerSideId: "p2",
      attackerPokemon: "p2a: Astrophysicist",
      move: "Destiny Bond",
      indirect: true,
    });
  });

  it("keeps -singlemove/-singleturn conditions for one turn only", () => {
    const parsed = parseService.parse(
      `
|player|p1|Alice
|player|p2|Bob
|teamsize|p1|6
|teamsize|p2|6
|poke|p1|Pikachu, M|
|poke|p2|Bulbasaur, M|
|switch|p1a: Sparky|Pikachu, M|100/100
|switch|p2a: Leafy|Bulbasaur, M|100/100
|turn|1
|move|p1a: Sparky|Protect|p1a: Sparky
|-singlemove|p1a: Sparky|Protect
|-singleturn|p1a: Sparky|Endure
|turn|2
|move|p2a: Leafy|Tackle|p1a: Sparky
`.trim(),
    );

    const turnStates = replayStatesService.build(parsed);
    const turn1Field = turnStates.find(
      (state) => state.turnNumber === 1,
    )?.field;
    const turn2Field = turnStates.find(
      (state) => state.turnNumber === 2,
    )?.field;

    const turn1Conditions = turn1Field?.sides.p1.positions.a.conditions ?? [];
    const turn2Conditions = turn2Field?.sides.p1.positions.a.conditions ?? [];

    expect(turn1Conditions.map((condition) => condition.id)).toEqual(
      expect.arrayContaining(["protect", "endure"]),
    );
    expect(turn1Conditions.every((condition) => condition.singleTurn)).toBe(
      true,
    );
    expect(turn2Conditions).toHaveLength(0);
  });
});
