import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ExternalMatchDto } from "./external-matchup-match.dto";

describe("ExternalMatchDto", () => {
  const basePayload = {
    aTeam: { score: 0, stats: [["pikachu", { status: "fainted" }]] },
    bTeam: { score: 1, stats: [["charizard", { status: "survived" }]] },
  };

  async function validatePayload(payload: Record<string, unknown>) {
    const dto = plainToInstance(ExternalMatchDto, payload);
    return validate(dto, { whitelist: true });
  }

  it("accepts a classic payload without kos", async () => {
    expect(await validatePayload(basePayload)).toHaveLength(0);
  });

  it("accepts a KO with and without an attacker", async () => {
    const errors = await validatePayload({
      ...basePayload,
      kos: [
        {
          victim: { team: "a", pokemon: "pikachu" },
          attacker: { team: "b", pokemon: "charizard" },
          indirect: false,
          note: "Flamethrower",
        },
        { victim: { team: "b", pokemon: "gengar" }, indirect: true },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it("keeps kos through the whitelist", async () => {
    const dto = plainToInstance(ExternalMatchDto, {
      ...basePayload,
      kos: [{ victim: { team: "a", pokemon: "pikachu" }, indirect: false }],
    });
    await validate(dto, { whitelist: true });

    expect(dto.kos).toEqual([
      { victim: { team: "a", pokemon: "pikachu" }, indirect: false },
    ]);
  });

  it("rejects a Pokémon knocked out twice in one game", async () => {
    const errors = await validatePayload({
      ...basePayload,
      kos: [
        { victim: { team: "a", pokemon: "pikachu" }, indirect: false },
        { victim: { team: "a", pokemon: "pikachu" }, indirect: true },
      ],
    });

    expect(errors.map((e) => e.property)).toContain("kos");
  });

  it("rejects an unknown side", async () => {
    const errors = await validatePayload({
      ...basePayload,
      kos: [{ victim: { team: "c", pokemon: "pikachu" }, indirect: false }],
    });

    expect(errors.map((e) => e.property)).toContain("kos");
  });

  it("rejects an overlong note", async () => {
    const errors = await validatePayload({
      ...basePayload,
      kos: [
        {
          victim: { team: "a", pokemon: "pikachu" },
          indirect: false,
          note: "x".repeat(201),
        },
      ],
    });

    expect(errors.map((e) => e.property)).toContain("kos");
  });
});
