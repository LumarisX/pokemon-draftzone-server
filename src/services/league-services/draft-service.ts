import { agenda } from "../../agenda";
import { Job } from "agenda";
import { LeagueDocument } from "../../models/league/league.model";
import { LeagueDivisionDocument } from "../../models/league/division.model";

export async function scheduleSkipPick(
  division: LeagueDivisionDocument,
  league: LeagueDocument
) {
  if (division.skipTime) {
    await agenda.schedule(division.skipTime, "league-pick-skip", {
      leagueId: league._id,
      divisionId: division._id,
    });
  }
}

export async function updateSkipPick(
  division: LeagueDivisionDocument,
  league: LeagueDocument,
  newSkipTime: Date
) {
  await agenda.cancel({
    name: "league-pick-skip",
    "data.divisionId": division._id,
  });

  await agenda.schedule(newSkipTime, "league-pick-skip", {
    leagueId: league._id,
    divisionId: division._id,
  });
}

export async function deleteSkipPick(division: LeagueDivisionDocument) {
  await agenda.cancel({
    name: "league-pick-skip",
    "data.divisionId": division._id,
  });
}

agenda.define("league-pick-skip", async (job: Job) => {
  const { leagueId, divisionId } = job.attrs.data;
  console.log(
    `Skipping pick for league ${leagueId} and division ${divisionId}`
  );
  // TODO: Implement the actual league-pick-skip logic here
});
