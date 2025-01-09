import { Mongoose } from "mongoose";
import { connectDBForTesting, disconnectDBForTesting } from ".";
import { ArchiveData, ArchiveModel } from "../archive.model";
import { ID } from "@pkmn/data";

describe("insert", () => {
  let connection: Mongoose;
  let db: number;

  beforeAll(async () => {
    await connectDBForTesting("test");
  });

  afterAll(async () => {
    await disconnectDBForTesting();
  });

  it("personModel Create Test", async () => {
    const archiveData: ArchiveData = {
      leagueName: "Pokémon World Championship",
      teamName: "Electric Sparks",
      owner: "Ash Ketchum",
      format: "smogon-doubles",
      ruleset: "standard",
      team: [
        { id: "pikachu" as ID },
        { id: "raichu" as ID },
        { id: "luxray" as ID },
        { id: "manectric" as ID },
        { id: "jolteon" as ID },
        { id: "electivire" as ID },
      ],
      matches: [
        {
          winner: "a",
          stage: "Quarterfinals",
          stats: [
            ["pikachu", { indirect: 3, kills: 2, deaths: 1, brought: 3 }],
            ["jolteon", { kills: 1, deaths: 2 }],
          ],
          score: [2, 1],
          replays: [],
        },
      ],
    };

    const archive = new ArchiveModel({ ...archiveData });
    const createdArchive = await archive.save();
    expect(createdArchive).toBeDefined();
    expect(createdArchive.leagueName).toBe(archive.leagueName);
    expect(createdArchive.teamName).toBe(archive.teamName);
    expect(createdArchive.owner).toBe(archive.owner);
    expect(createdArchive.format).toBe(archive.format);
    expect(createdArchive.ruleset).toBe(archive.ruleset);
    expect(createdArchive.team).toBe(archive.team);
    expect(createdArchive.matches).toBe(archive.matches);
  });
});
