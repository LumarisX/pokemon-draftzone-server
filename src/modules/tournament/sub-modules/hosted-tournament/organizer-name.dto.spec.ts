import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { OrganizerNameDto } from "./hosted-tournament.dto";

function check(name: unknown) {
  const dto = plainToInstance(OrganizerNameDto, { name });
  return { name: dto.name, valid: validateSync(dto).length === 0 };
}

describe("OrganizerNameDto", () => {
  it.each(["Misty", "Gym Leader Misty", "Élodie", "Nurse_Joy2", "Lt. Surge"])(
    "accepts %j",
    (name) => {
      expect(check(name).valid).toBe(true);
    },
  );

  it("trims surrounding whitespace before validating", () => {
    expect(check("  Nurse Joy  ")).toEqual({ name: "Nurse Joy", valid: true });
  });

  it.each(["Jo", "_Brock", "Ash!", "a\tb", "x".repeat(25), "   ", 42])(
    "rejects %j",
    (name) => {
      expect(check(name).valid).toBe(false);
    },
  );
});
