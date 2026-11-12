import {
  NamedTeam,
  displayTeamName,
  letterCollisions,
  normalizeTeamName,
  variantLetter,
} from "./team-names";

const team = (id: string, baseName: string, variant?: number): NamedTeam => ({
  id,
  baseName,
  ...(variant === undefined ? {} : { variant }),
});

describe("normalizeTeamName", () => {
  it("ignores case, spacing, punctuation and accents", () => {
    expect(normalizeTeamName("St. Louis Kingdras")).toBe(
      normalizeTeamName("st louis  KINGDRAS"),
    );
    expect(normalizeTeamName("Pokémon Pals")).toBe(
      normalizeTeamName("Pokemon Pals"),
    );
  });

  it("keeps names made only of symbols apart", () => {
    expect(normalizeTeamName("!!!")).not.toBe(normalizeTeamName("???"));
  });
});

describe("variantLetter", () => {
  it("runs X, Y, Z, then A onward", () => {
    expect([0, 1, 2, 3, 4, 5].map(variantLetter)).toEqual([
      "X",
      "Y",
      "Z",
      "A",
      "B",
      "C",
    ]);
    expect(variantLetter(25)).toBe("W");
  });

  it("numbers a second lap instead of repeating letters", () => {
    expect(variantLetter(26)).toBe("X2");
  });
});

describe("displayTeamName", () => {
  it("adds the letter only when there is a variant", () => {
    expect(displayTeamName("Miami Palafins")).toBe("Miami Palafins");
    expect(displayTeamName("Miami Palafins", 1)).toBe("Miami Palafins Y");
  });
});

describe("letterCollisions", () => {
  it("leaves a team alone when nobody shares its name", () => {
    expect(
      letterCollisions(
        [team("a", "Miami Palafins"), team("b", "Sinnoh Jazz")],
        "b",
      ),
    ).toEqual([]);
  });

  it("letters both teams when a second one takes the name, the earlier one first", () => {
    expect(
      letterCollisions(
        [team("a", "Miami Palafins"), team("b", "miami palafins")],
        "b",
      ),
    ).toEqual([
      { id: "a", baseName: "Miami Palafins", variant: 0, teamName: "Miami Palafins X" },
      { id: "b", baseName: "miami palafins", variant: 1, teamName: "miami palafins Y" },
    ]);
  });

  it("gives a third team the next letter and leaves lettered teams alone", () => {
    expect(
      letterCollisions(
        [
          team("a", "Sturdy Shedinjas", 0),
          team("b", "Sturdy Shedinjas", 1),
          team("c", "Sturdy Shedinjas"),
        ],
        "c",
      ),
    ).toEqual([
      { id: "c", baseName: "Sturdy Shedinjas", variant: 2, teamName: "Sturdy Shedinjas Z" },
    ]);
  });

  it("keeps letters once given, so a lone lettered team stays lettered", () => {
    expect(
      letterCollisions(
        [team("b", "Sturdy Shedinjas", 1), team("c", "Sinnoh Jazz")],
        "b",
      ),
    ).toEqual([]);
  });

  it("reuses a letter nobody holds any more", () => {
    expect(
      letterCollisions(
        [team("b", "Sturdy Shedinjas", 1), team("c", "Sturdy Shedinjas")],
        "c",
      ),
    ).toEqual([
      { id: "c", baseName: "Sturdy Shedinjas", variant: 0, teamName: "Sturdy Shedinjas X" },
    ]);
  });

  it("letters existing unlettered duplicates in order before the newcomer", () => {
    expect(
      letterCollisions(
        [
          team("new", "Lumiose Suns"),
          team("a", "Lumiose Suns"),
          team("b", "Lumiose Suns"),
        ],
        "new",
      ).map((assignment) => [assignment.id, assignment.teamName]),
    ).toEqual([
      ["a", "Lumiose Suns X"],
      ["b", "Lumiose Suns Y"],
      ["new", "Lumiose Suns Z"],
    ]);
  });

  it("does nothing for a team that is not in the list", () => {
    expect(letterCollisions([team("a", "Sinnoh Jazz")], "missing")).toEqual([]);
  });
});
