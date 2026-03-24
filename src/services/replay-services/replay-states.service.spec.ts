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

    const turn1P2ActiveKey = turn1Field?.sides.p2.active.a.pokemonKey;
    expect(turn1P2ActiveKey).toBeDefined();

    const turn1P2Active = turn1P2ActiveKey
      ? turn1Field?.sides.p2.pokemon[turn1P2ActiveKey]
      : undefined;
    expect(turn1P2Active?.hp?.current).toBe(30);
    expect(turn1P2Active?.hp?.max).toBe(100);
    expect(turn1P2Active?.status).toBe("par");

    const turn2Field = turnStates.find(
      (state) => state.turnNumber === 2,
    )?.field;
    const turn2P2ActiveKey = turn2Field?.sides.p2.active.a.pokemonKey;
    const turn2P2Active = turn2P2ActiveKey
      ? turn2Field?.sides.p2.pokemon[turn2P2ActiveKey]
      : undefined;
    expect(turn2P2Active?.hp?.current).toBe(50);
    expect(turn2P2Active?.status).toBe("par");

    const turn2P1ActiveKey = turn2Field?.sides.p1.active.a.pokemonKey;
    const turn2P1Active = turn2P1ActiveKey
      ? turn2Field?.sides.p1.pokemon[turn2P1ActiveKey]
      : undefined;
    expect(turn2P1Active?.fainted).toBe(true);
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
    const turn5P1ActiveKey = turn5Field?.sides.p1.active.a.pokemonKey;
    const turn5P1Active = turn5P1ActiveKey
      ? turn5Field?.sides.p1.pokemon[turn5P1ActiveKey]
      : undefined;
    expect(turn5P1Active?.species).toBe("vaporeon");
    expect(turn5P1Active?.hp?.current).toBe(50);

    const finalField = turnStates[turnStates.length - 1]?.field;
    expect(finalField?.winner).toBe("notagreatrainer");
  });
});
