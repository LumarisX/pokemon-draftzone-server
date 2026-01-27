import Agenda, { Job } from "agenda";
import { config } from "./config";
import { skipCurrentPick } from "./services/league-services/draft-service";
import { LeagueDivisionDocument } from "./models/league/division.model";
import League, { LeagueDocument } from "./models/league/league.model";
import FileUploadModel from "./models/file-upload.model";
import { s3Service } from "./services/s3.service";
import { logger } from "./app";

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
    d._id.equals(divisionId),
  ) as LeagueDivisionDocument;
  if (!division) {
    console.error(`Division not found: ${divisionId} in league ${leagueId}`);
    return;
  }

  await skipCurrentPick(league, division);
});

// Cleanup old file upload records and orphaned S3 files
agenda.define("cleanup-file-uploads", async (job: Job) => {
  try {
    // Find and delete orphaned pending uploads (>24 hours old, never confirmed)
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
  league: LeagueDocument,
  division: LeagueDivisionDocument,
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
  division: LeagueDivisionDocument,
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

// Schedule recurring cleanup job (runs daily at 3 AM)
export async function startRecurringJobs() {
  await agenda.start();
  await agenda.every("0 3 * * *", "cleanup-file-uploads");
  logger.info("Scheduled recurring file upload cleanup job");
}
