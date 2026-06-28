import mongoose, { Schema } from "mongoose";
import { MatchDataSchema } from "./external-matchup-match.schema";

describe("ExternalMatch schema stats persistence", () => {
  const ParentSchema = new Schema({
    matches: { type: [MatchDataSchema], required: true },
  });
  const MatchupModel = mongoose.model(
    `__StatsSchemaSpec_${Date.now()}`,
    ParentSchema,
  );

  const stats = (): [string, Record<string, number>][] => [
    ["pikachu", { brought: 1, kills: 2, deaths: 1, indirect: 0 }],
    ["charizard", { brought: 1, kills: 0, deaths: 1, indirect: 1 }],
  ];
  const matchData = () => ({
    winner: "b" as const,
    aTeam: { score: 0, stats: stats() },
    bTeam: { score: 4, stats: stats() },
  });

  it("preserves stats tuples when constructing a document (save path)", () => {
    const doc = new MatchupModel({ matches: [matchData()] });

    const obj = doc.toObject() as any;
    expect(obj.matches[0].aTeam.stats).toEqual(stats());
    expect(obj.matches[0].bTeam.stats).toEqual(stats());
  });

  it("preserves stats tuples when hydrating a stored document (read path)", () => {
    const raw = {
      _id: new mongoose.Types.ObjectId(),
      matches: [matchData()],
    };

    const hydrated = MatchupModel.hydrate(raw) as any;
    expect(hydrated.matches[0].aTeam.stats).toEqual(stats());
    expect(hydrated.matches[0].bTeam.stats).toEqual(stats());
  });
});
