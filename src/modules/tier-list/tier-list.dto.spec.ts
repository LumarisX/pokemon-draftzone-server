import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateTierListDto } from "./tier-list.dto";

const mon = (i: number) => ({ id: `mon${i}`, name: `Mon ${i}` });

const body = (tiers: unknown[]) => ({ tiers, version: 3 });

const check = (value: unknown) =>
  validate(plainToInstance(UpdateTierListDto, value));

describe("UpdateTierListDto limits", () => {
  it("accepts a full-dex list", async () => {
    const pokemon = Array.from({ length: 1400 }, (_, i) => mon(i));
    const errors = await check(
      body([
        { name: "S", cost: 20, pokemon: pokemon.slice(0, 700) },
        { name: "A", cost: 15, pokemon: pokemon.slice(700) },
      ]),
    );
    expect(errors).toHaveLength(0);
  });

  it("rejects more than 60 tiers", async () => {
    const tiers = Array.from({ length: 61 }, (_, i) => ({
      name: `T${i}`,
      cost: i,
      pokemon: [],
    }));
    expect(await check(body(tiers))).not.toHaveLength(0);
  });

  it("rejects more than 2000 pokemon in a tier", async () => {
    const pokemon = Array.from({ length: 2001 }, (_, i) => mon(i));
    expect(
      await check(body([{ name: "S", cost: 1, pokemon }])),
    ).not.toHaveLength(0);
  });

  it("rejects a tier name over 64", async () => {
    expect(
      await check(body([{ name: "x".repeat(65), cost: 1, pokemon: [] }])),
    ).not.toHaveLength(0);
  });
});
