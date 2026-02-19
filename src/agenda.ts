import Agenda, { Job } from "agenda";
import { config } from "./config";
import {
  getCurrentPickingTeam,
  skipCurrentPick,
} from "./services/league-services/draft-service";
import { LeagueDivisionDocument } from "./models/league/division.model";
import { LeagueCoachDocument } from "./models/league/coach.model";
import League, {
  LeagueTournamentDocument,
} from "./models/league/tournament.model";
import FileUploadModel from "./models/file-upload.model";
import { s3Service } from "./services/s3.service";
import { logger } from "./app";
import { resolveDiscordMention, sendDiscordMessage } from "./discord";

const mongoConnectionString = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

export const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "jobs" },
});

const SKIP_REMINDER_THRESHOLD_SECONDS = 3601;
const ONE_HOUR_MS = 60 * 60 * 1000;

agenda.define("skip-draft-pick", async (job: Job) => {
  const { tournamentId, divisionId } = job.attrs.data;
  const league = await League.findById(tournamentId).populate([
    {
      path: "divisions",
      populate: {
        path: "teams",
        populate: {
          path: "coach",
        },
      },
    },
    {
      path: "tierList",
    },
  ]);
  if (!league) {
    console.error(`League not found: ${tournamentId}`);
    return;
  }
  const division = league.divisions.find((d) =>
    d._id.equals(divisionId),
  ) as LeagueDivisionDocument;
  if (!division) {
    console.error(
      `Division not found: ${divisionId} in league ${tournamentId}`,
    );
    return;
  }

  await skipCurrentPick(league, division);
});

agenda.define("skip-draft-reminder", async (job: Job) => {
  const { tournamentId, divisionId, skipTime } = job.attrs.data as {
    tournamentId: string;
    divisionId: string;
    skipTime?: string | Date;
  };
  const league = await League.findById(tournamentId).populate([
    {
      path: "divisions",
      populate: {
        path: "teams",
        populate: {
          path: "coach",
        },
      },
    },
    {
      path: "tierList",
    },
  ]);
  if (!league) {
    console.error(`League not found: ${tournamentId}`);
    return;
  }
  const division = league.divisions.find((d) =>
    d._id.equals(divisionId),
  ) as LeagueDivisionDocument;
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
  await agenda.start();
  await agenda.every("0 3 * * *", "cleanup-file-uploads");
  logger.info("Scheduled recurring file upload cleanup job");
}
