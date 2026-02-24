import Agenda, { Job } from "agenda";
import { logger } from "./app";
import { config } from "./config";
import { resolveDiscordMention, sendDiscordMessage } from "./discord";
import FileUploadModel from "./models/file-upload.model";
import { LeagueCoachDocument } from "./models/league/coach.model";
import LeagueDivisionModel, {
  LeagueDivisionDocument,
} from "./models/league/division.model";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "./models/league/tournament.model";
import {
  getCurrentPickingTeam,
  skipCurrentPick,
} from "./services/league-services/draft-service";
import { s3Service } from "./services/s3.service";
import { LeagueTeamDocument } from "./models/league/team.model";
import { LeagueTierListDocument } from "./models/league/tier-list.model";

const mongoConnectionString = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

export const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "jobs" },
});

const ONE_HOUR_MS = 60 * 60 * 1000;
const SKIP_REMINDER_THRESHOLD_SECONDS = ONE_HOUR_MS + 1;
const SKIP_RETRY_DELAY_MS = 60 * 1000;
const SKIP_MAX_RETRIES = 10;

agenda.define("skip-draft-pick", async (job: Job) => {
  if (isDev) return;
  const {
    tournamentId,
    divisionId,
    retryCount = 0,
  } = job.attrs.data as {
    tournamentId: string;
    divisionId: string;
    retryCount?: number;
  };
  const tournament = await LeagueTournamentModel.findById(
    tournamentId,
  ).populate<{ tierList: LeagueTierListDocument }>({
    path: "tierList",
  });
  if (!tournament) {
    logger.error(
      `Tournament not found for skip-draft-pick job: ${tournamentId}`,
    );
    return;
  }
  const division = await LeagueDivisionModel.findById(divisionId).populate<{
    teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
  }>([
    {
      path: "teams",
      populate: {
        path: "coach",
      },
    },
  ]);
  if (!division) {
    logger.error(`Division not found for skip-draft-pick job: ${divisionId}`);
    return;
  }
  logger.info(
    `Executing skip-draft-pick for tournament ${tournament.name}, division ${division.name}`,
  );
  const skipped = await skipCurrentPick(tournament, division);
  if (skipped) {
    return;
  }

  const latestDivision = await LeagueDivisionModel.findById(divisionId);
  if (
    !latestDivision ||
    latestDivision.status !== "IN_PROGRESS" ||
    !latestDivision.skipTime
  ) {
    return;
  }

  const retryTime = new Date(Date.now() + SKIP_RETRY_DELAY_MS);
  if (latestDivision.skipTime.getTime() > retryTime.getTime()) {
    return;
  }

  if (retryCount >= SKIP_MAX_RETRIES) {
    logger.warn(
      `skip-draft-pick reached max retries for tournament ${tournament.name}, division ${division.name}`,
    );
    return;
  }

  logger.warn(
    `skip-draft-pick no-op for tournament ${tournament.name}, division ${division.name}; retrying in 1 minute (${retryCount + 1}/${SKIP_MAX_RETRIES})`,
  );
  job.schedule(retryTime);
  job.attrs.data = {
    tournamentId,
    divisionId,
    retryCount: retryCount + 1,
  };
  await job.save();
});

agenda.define("skip-draft-reminder", async (job: Job) => {
  if (isDev) return;
  const { tournamentId, divisionId, skipTime } = job.attrs.data as {
    tournamentId: string;
    divisionId: string;
    skipTime?: string | Date;
  };
  const league = await LeagueTournamentModel.findById(tournamentId).populate({
    path: "tierList",
  });
  if (!league) {
    console.error(`League not found: ${tournamentId}`);
    return;
  }
  const division = await LeagueDivisionModel.findById(divisionId).populate<{
    teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
  }>({
    path: "teams",
    populate: {
      path: "coach",
    },
  });
  if (!division) {
    console.error(
      `Division not found: ${divisionId} in league ${tournamentId}`,
    );
    return;
  }

  if (division.status !== "IN_PROGRESS" || !division.skipTime) return;

  if (skipTime) {
    const expectedTime = new Date(skipTime).getTime();
    if (Math.abs(division.skipTime.getTime() - expectedTime) > 1000) return;
  }

  const currentTeam = getCurrentPickingTeam(division);
  if (!currentTeam || !division.channelId) return;

  const coach = currentTeam.coach as LeagueCoachDocument | undefined;
  const teamName = coach?.teamName ?? "Unknown Team";
  const coachMention = await resolveDiscordMention(
    division.channelId,
    coach?.discordName,
  );
  const coachLabel = coachMention ?? "coach";
  await sendDiscordMessage(
    division.channelId,
    `${teamName} (${coachLabel}) has 1 hour remaining!`,
  );
});

agenda.define("cleanup-file-uploads", async (job: Job) => {
  if (isDev) return;
  try {
    const orphanedUploads = await FileUploadModel.find({
      status: "pending",
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    let deletedOrphans = 0;
    for (const upload of orphanedUploads) {
      if (s3Service.isEnabled()) {
        try {
          await s3Service.deleteFile(upload.key);
          logger.info(`Deleted orphaned S3 file: ${upload.key}`);
        } catch (error) {
          logger.warn(`Failed to delete S3 file ${upload.key}: ${error}`);
        }
      }
      await FileUploadModel.deleteOne({ _id: upload._id });
      deletedOrphans++;
    }

    // Delete "deleted" status records older than 30 days (cleanup completed)
    const deletedResult = await FileUploadModel.deleteMany({
      status: "deleted",
      deletedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    logger.info(
      `File upload cleanup: ${deletedOrphans} orphaned uploads, ${deletedResult.deletedCount} old deleted records`,
    );
  } catch (error) {
    logger.error("File upload cleanup error:", error);
  }
});

const isDev = config.NODE_ENV === "development";

export async function scheduleSkipPick(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
) {
  await agenda.start();
  const now = new Date();
  now.setSeconds(now.getSeconds() + division.timerLength);
  division.skipTime = now;
  await agenda.schedule(division.skipTime, "skip-draft-pick", {
    tournamentId: league._id,
    divisionId: division._id,
  });
  await scheduleSkipReminder(league, division);
}

export async function cancelSkipPick(division: LeagueDivisionDocument) {
  await agenda.start();
  await agenda.cancel({
    name: "skip-draft-pick",
    "data.divisionId": division._id,
  });
  await agenda.cancel({
    name: "skip-draft-reminder",
    "data.divisionId": division._id,
  });
}

export async function resumeSkipPick(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
) {
  await agenda.start();
  if (division.skipTime)
    await agenda.schedule(division.skipTime, "skip-draft-pick", {
      tournamentId: league._id,
      divisionId: division._id,
    });
  await scheduleSkipReminder(league, division);
}

async function scheduleSkipReminder(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
) {
  if (!division.skipTime) {
    return;
  }

  const timeToSkipSeconds = (division.skipTime.getTime() - Date.now()) / 1000;
  if (timeToSkipSeconds <= SKIP_REMINDER_THRESHOLD_SECONDS) {
    return;
  }

  const reminderTime = new Date(division.skipTime.getTime() - ONE_HOUR_MS);
  if (reminderTime.getTime() <= Date.now()) {
    return;
  }

  await agenda.schedule(reminderTime, "skip-draft-reminder", {
    tournamentId: league._id,
    divisionId: division._id,
    skipTime: division.skipTime,
  });
}

// Graceful shutdown
async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);

// Schedule recurring cleanup job (runs daily at 3 AM)
export async function startRecurringJobs() {
  if (isDev) {
    logger.info("Skipping recurring jobs in development mode");
    return;
  }
  await agenda.start();
  await agenda.every("0 3 * * *", "cleanup-file-uploads");
  logger.info("Scheduled recurring file upload cleanup job");
}
