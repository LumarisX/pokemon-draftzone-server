import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QuickMatchupDto } from "./quick-matchup.dto";

const mon = (n: number) => ({ id: `mon${n}`, name: `Mon ${n}` });
const side = (count: number) => ({
  teamName: "Team",
  team: Array.from({ length: count }, (_, i) => mon(i)),
});

async function errorsFor(body: unknown) {
  return validate(plainToInstance(QuickMatchupDto, body));
}

describe("QuickMatchupDto", () => {
  it("accepts a good body", async () => {
    const errors = await errorsFor({
      format: "Singles",
      ruleset: "Gen9 NatDex",
      side1: side(6),
      side2: side(20),
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing side", async () => {
    const errors = await errorsFor({
      format: "Singles",
      ruleset: "Gen9 NatDex",
      side1: side(6),
    });
    expect(errors.map((e) => e.property)).toContain("side2");
  });

  it("rejects a team of 21", async () => {
    const errors = await errorsFor({
      format: "Singles",
      ruleset: "Gen9 NatDex",
      side1: side(21),
      side2: side(6),
    });
    expect(errors.map((e) => e.property)).toContain("side1");
  });

  it("rejects an empty team", async () => {
    const errors = await errorsFor({
      format: "Singles",
      ruleset: "Gen9 NatDex",
      side1: side(6),
      side2: side(0),
    });
    expect(errors.map((e) => e.property)).toContain("side2");
  });
});
