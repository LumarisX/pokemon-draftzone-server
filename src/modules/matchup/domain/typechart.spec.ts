import { Rulesets } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { getTeamTypechart } from "./typechart";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;

function mon(id: string) {
  return new PDZPokemon({ id }, NAT_DEX);
}

describe("getTeamTypechart", () => {
  it("includes each Pokemon's client payload, types, and [typechart, raw type weakness] pair", () => {
    const pikachu = mon("pikachu");
    const charizard = mon("charizard");

    const result = getTeamTypechart([pikachu, charizard]);

    expect(result.team).toHaveLength(2);
    expect(result.team[0]).toMatchObject({
      ...PokemonMapper.toClientPayload(pikachu),
      types: pikachu.types,
      weak: [pikachu.typechart(), PDZPokemon.typeWeak(pikachu.types, NAT_DEX)],
    });
    expect(result.team[1]).toMatchObject({
      ...PokemonMapper.toClientPayload(charizard),
      types: charizard.types,
      weak: [charizard.typechart(), PDZPokemon.typeWeak(charizard.types, NAT_DEX)],
    });
  });

  it("reflects ability-based typechart modifiers (e.g. Lightning Rod grants Pikachu Electric immunity)", () => {
    const pikachu = mon("pikachu");

    const result = getTeamTypechart([pikachu]);

    // Raw type weakness says Electric-on-Electric is merely resisted (0.5x)...
    expect(PDZPokemon.typeWeak(pikachu.types, NAT_DEX).Electric).toBe(0.5);
    // ...but Pikachu's own ability (Lightning Rod) grants full immunity instead.
    expect(result.team[0].weak[0].Electric).toBe(0);
  });

  it("always returns an empty teraTypes object", () => {
    const result = getTeamTypechart([mon("pikachu")]);

    expect(result.teraTypes).toEqual({});
  });
});
