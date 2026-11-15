import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PokemonDto } from "./pokemon.dto";

const check = (body: unknown) =>
  validate(plainToInstance(PokemonDto, body), { whitelist: true });

describe("PokemonDto limits", () => {
  it("accepts a realistic pokemon", async () => {
    const errors = await check({
      id: "garchomp",
      name: "Garchomp",
      nickname: "Chompy",
      modifiers: { abilities: ["roughskin"], moves: ["earthquake"] },
      capt: { tera: ["Ground"], z: [], dmax: false },
      draftFormes: [{ id: "garchompmega", name: "Garchomp-Mega" }],
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects a move list over 200", async () => {
    const errors = await check({
      id: "a",
      name: "A",
      modifiers: { moves: Array.from({ length: 201 }, () => "tackle") },
    });
    expect(errors).not.toHaveLength(0);
  });

  it("accepts exactly 200 moves", async () => {
    const errors = await check({
      id: "a",
      name: "A",
      modifiers: { moves: Array.from({ length: 200 }, () => "tackle") },
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects a name over 64 characters", async () => {
    const errors = await check({ id: "a", name: "x".repeat(65) });
    expect(errors).not.toHaveLength(0);
  });
});
