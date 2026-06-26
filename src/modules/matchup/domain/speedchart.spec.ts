import { ID } from "@pkmn/data";
import { Rulesets } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { speedchart } from "./speedchart";

const NAT_DEX = Rulesets["Gen 9"]["National Dex"].ruleset;
const CHAMPIONS_MA = Rulesets.Champions["M-A"].ruleset;
const RADICAL_RED = Rulesets["Rom Hacks"]["Radical Red"].ruleset;
const GEN_1 = Rulesets["Older Gens"]["Generation 1"].ruleset;

function mon(id: string, ruleset = NAT_DEX) {
  return new PDZPokemon(id as ID, ruleset);
}

// Parity baseline for the upcoming speedchart rebuild. Covers every branch in
// the current implementation: stage-pushing abilities (Speed Boost, Steam
// Engine), multiplier abilities both with and without an item slot (Unburden/
// Quick Feet vs. Chlorophyll/Quark Drive), the required-item fallback
// (Giratina-Origin), the Electric-type paralysis immunity skip (Pikachu), the
// Aegislash -> Aegislash-Shield id substitution, a stat-point ruleset
// (Champions M-A), a modded ruleset (Radical Red), and a pre-gen-3 ruleset
// (Generation 1, which exercises the legacy boost table and the items-don't-
// exist-yet exception path).
describe("speedchart", () => {
  it("matches the recorded baseline across ability/item/ruleset combinations", () => {
    const standardTeam = [
      mon("pikachu"),
      mon("venusaur"),
      mon("hawlucha"),
      mon("ursaring"),
      mon("ironbundle"),
      mon("yanmega"),
      mon("coalossal"),
      mon("giratinaorigin"),
      mon("aegislash"),
    ];
    const statPointsTeam = [mon("venusaur", CHAMPIONS_MA), mon("pikachu", CHAMPIONS_MA)];
    const moddedTeam = [mon("granbull", RADICAL_RED)];
    const gen1Team = [mon("tauros", GEN_1)];

    const result = speedchart(
      [standardTeam, statPointsTeam, moddedTeam, gen1Team],
      100,
    );

    expect(result).toMatchSnapshot();
  });
});
