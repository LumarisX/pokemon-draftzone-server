import mongoose, { Schema } from "mongoose";
import { ArchiveMatchV1Schema, ArchiveMatchV2Schema } from "./archive.schema";

describe("Archive schema stats persistence", () => {
  const stats = (): [string, Record<string, number>][] => [
    ["pikachu", { brought: 1, kills: 2, deaths: 1, indirect: 0 }],
    ["charizard", { brought: 1, kills: 0, deaths: 1, indirect: 1 }],
  ];

  it("preserves V1 match stats tuples on construct", () => {
    const Model = mongoose.model(
      `__ArchiveV1SchemaSpec_${Date.now()}`,
      new Schema({ matches: { type: [ArchiveMatchV1Schema] } }),
    );

    const doc = new Model({
      matches: [{ stage: "r1", stats: stats(), score: [0, 4] }],
    });

    expect((doc.toObject() as any).matches[0].stats).toEqual(stats());
  });

  it("preserves V2 per-team stats tuples on construct", () => {
    const Model = mongoose.model(
      `__ArchiveV2SchemaSpec_${Date.now()}`,
      new Schema({ matches: { type: [ArchiveMatchV2Schema] } }),
    );

    const doc = new Model({
      matches: [
        {
          aTeam: { score: 0, stats: stats() },
          bTeam: { score: 4, stats: stats() },
        },
      ],
    });

    const obj = doc.toObject() as any;
    expect(obj.matches[0].aTeam.stats).toEqual(stats());
    expect(obj.matches[0].bTeam.stats).toEqual(stats());
  });
});
