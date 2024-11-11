import { DraftModel } from "../src/models/draft.model";
import { MatchupModel } from "../src/models/matchup.model";

export async function draftCountReport() {
  let stats: { [key: string]: { [key: string]: number } } = {};
  let drafts = await DraftModel.find({}).lean();
  drafts.forEach((draft) => {
    draft.team.forEach((mon) => {
      if (!stats[draft.ruleset]) {
        stats[draft.ruleset] = {};
      }
      if (stats[draft.ruleset][mon.id]) {
        stats[draft.ruleset][mon.id]++;
      } else {
        stats[draft.ruleset][mon.id] = 1;
      }
    });
  });

  let matchups = await MatchupModel.find({}).lean();
  const uniqueMatchups = matchups.filter((matchup, index, self) => {
    // Create a unique key by sorting the ids and joining them with a separator
    const teamKey = matchup.bTeam.team
      .map((member) => member.id)
      .sort()
      .join(",");

    if (
      drafts.find((draft) => {
        draft.team
          .map((member) => member.id)
          .sort()
          .join(",") === teamKey;
      })
    )
      return false;
    // Only keep the matchup if this key has not been encountered before
    return (
      index ===
      self.findIndex(
        (m) =>
          m.bTeam.team
            .map((member) => member.id)
            .sort()
            .join(",") === teamKey
      )
    );
  });

  uniqueMatchups.forEach((mu) => {
    const ruleset = drafts.find((draft) => {
      // console.log(draft._id.toString(), mu.aTeam._id?.toString());
      return draft._id.toString() === mu.aTeam._id?.toString();
    })?.ruleset;
    if (!ruleset) return;
    mu.bTeam.team.forEach((mon) => {
      if (!stats[ruleset]) {
        stats[ruleset] = {};
      }
      if (stats[ruleset][mon.id]) {
        stats[ruleset][mon.id]++;
      } else {
        stats[ruleset][mon.id] = 1;
      }
    });
  });

  for (let ruleset in stats) {
    console.log(`${ruleset}:`);
    console.log(Object.entries(stats[ruleset]).sort((x, y) => y[1] - x[1]));
  }
}
