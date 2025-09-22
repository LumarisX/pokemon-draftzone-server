import Agenda, { Job } from "agenda";
import { config } from "./config";
import { skipCurrentPick } from "./services/league-services/draft-service";
import { LeagueDivisionDocument } from "./models/league/division.model";
import League, { LeagueDocument } from "./models/league/league.model";

const mongoConnectionString = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

export const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "jobs" },
});

agenda.define("skip-draft-pick", async (job: Job) => {
  const { leagueId, divisionId } = job.attrs.data;
  const league = await League.findById(leagueId).populate([
    {
      path: "divisions",
      populate: {
        path: "teams",
        populate: {
          path: "coaches",
        },
      },
    },
    {
      path: "tierList",
    },
  ]);
  if (!league) {
    console.error(`League not found: ${leagueId}`);
    return;
  }
  const division = league.divisions.find((d) =>
    d._id.equals(divisionId)
  ) as LeagueDivisionDocument;
  if (!division) {
    console.error(`Division not found: ${divisionId} in league ${leagueId}`);
    return;
  }

  await skipCurrentPick(league, division);
});

export async function scheduleSkipPick(
  league: LeagueDocument,
  division: LeagueDivisionDocument
) {
  await agenda.start();
  const now = new Date();
  now.setSeconds(now.getSeconds() + division.timerLength);
  division.skipTime = now;
  await agenda.schedule(division.skipTime, "skip-draft-pick", {
    leagueId: league._id,
    divisionId: division._id,
  });
}

export async function cancelSkipPick(division: LeagueDivisionDocument) {
  await agenda.start();
  await agenda.cancel({
    name: "skip-draft-pick",
    "data.divisionId": division._id,
  });
}

export async function resumeSkipPick(
  league: LeagueDocument,
  division: LeagueDivisionDocument
) {
  await agenda.start();
  if (division.skipTime)
    await agenda.schedule(division.skipTime, "skip-draft-pick", {
      leagueId: league._id,
      divisionId: division._id,
    });
}

// Graceful shutdown
async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);
