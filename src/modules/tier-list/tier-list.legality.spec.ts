import { Tier, TierList, TierListPokemon } from "./tier-list.domain";
import { TierListService } from "./tier-list.service";
import { tierId } from "./tier-list.test-ids";

function build(pokemon: [string, string][], banned: TierList["banned"]) {
  return new TierList({
    id: "tl",
    slug: "tl",
    name: "Legality",
    createdBy: "auth0|owner",
    pokemon: new Map(
      pokemon.map(([id, name]) => [
        id,
        new TierListPokemon({ name, tierId: tierId("A") }),
      ]),
    ),
    tiers: [new Tier({ id: tierId("A"), name: "A", cost: 5 })],
    banned,
    format: "Singles",
    ruleset: "Gen9 NatDex",
    visibility: "public",
  });
}

const report = (tierList: TierList) =>
  TierListService.prototype.legalityReport.call({}, tierList);

describe("TierListService.legalityReport unused bans", () => {
  it("names the bans nothing on the list can use", async () => {
    const result = await report(
      build([["pikachu", "Pikachu"]], {
        moves: ["Volt Tackle", "Spore"],
        abilities: ["Lightning Rod", "Moody"],
      }),
    );

    expect(result.unusedBans).toEqual({
      moves: ["Spore"],
      abilities: ["Moody"],
    });
  });

  it("treats every move as usable once Smeargle is on the list", async () => {
    const result = await report(
      build(
        [
          ["pikachu", "Pikachu"],
          ["smeargle", "Smeargle"],
        ],
        { moves: ["Spore", "Shell Smash"], abilities: [] },
      ),
    );

    expect(result.unusedBans.moves).toEqual([]);
  });
});
