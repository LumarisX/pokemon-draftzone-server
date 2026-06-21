import { MongoBackend } from "@agendajs/mongo-backend";
import { Agenda, Job } from "agenda";
import mongoose from "mongoose";
import { logger } from "./app";
import { config } from "./config";
import { resolveDiscordMention, sendDiscordMessage } from "./discord";
import FileUploadModel from "./models/file-upload.model";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "./models/league/tournament.model";
import {
  getCurrentPickingTeam,
  skipCurrentPick,
} from "./services/league-services/draft-service";
import { s3Service } from "./services/s3.service";
import { LeagueTierListDocument } from "./models/league/tier-list.model";
import {
  DraftDocument,
  DraftEntity,
  DraftSchema,
} from "@modules/draft/draft.schema";
import { PopulatedDraft } from "@modules/draft/draft.repository";
import { TeamDocument, TeamEntity, TeamSchema } from "@modules/team/team.schema";
import { CoachDocument } from "@modules/coach/coach.schema";

const mongoConnectionString = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

export const agenda = new Agenda({
  backend: new MongoBackend({
    address: mongoConnectionString,
    collection: "jobs",
  }),
});

// Plain Mongoose model lookups (not Nest-DI) — this file is a free-function
// module with agenda.define(...) job handlers, not a Nest-managed class, so
// it can't take DraftRepository/TeamRepository via constructor injection.
// Mirrors the same pattern used in services/league-services/draft-service.ts
// and stage-service.ts: resolve against whatever model Nest already
// registered for these entities on the default connection, falling back to
// registering directly if this module loads before Nest does.
const DraftMongooseModel: mongoose.Model<DraftDocument> =
  (mongoose.models[DraftEntity.name] as mongoose.Model<DraftDocument>) ??
  (mongoose.model(
    DraftEntity.name,
    DraftSchema,
  ) as unknown as mongoose.Model<DraftDocument>);

const TeamMongooseModel: mongoose.Model<TeamDocument> =
  (mongoose.models[TeamEntity.name] as mongoose.Model<TeamDocument>) ??
  (mongoose.model(
    TeamEntity.name,
    TeamSchema,
  ) as unknown as mongoose.Model<TeamDocument>);

/**
 * `teams` is composed in memory from a separate Team query, not a real
 * schema field on DraftEntity — mirrors DraftRepository.findDraft's
 * composition pattern, just without Nest DI.
 */
async function findPopulatedDraft(
  draftId: string,
): Promise<PopulatedDraft | null> {
  const draft = await DraftMongooseModel.findById(draftId);
  if (!draft) return null;

  const teams = await TeamMongooseModel.find({ draftId: draft._id }).populate<{
    coach: CoachDocument;
  }>("coach");

  return Object.assign(draft, { teams }) as unknown as PopulatedDraft;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const SKIP_REMINDER_THRESHOLD_SECONDS = ONE_HOUR_MS + 1;
const SKIP_RETRY_DELAY_MS = 60 * 1000;
const SKIP_MAX_RETRIES = 10;

agenda.define("skip-draft-pick", async (job: Job) => {
  if (isDev) return;
  const {
    tournamentId,
    draftId,
    retryCount = 0,
  } = job.attrs.data as {
    tournamentId: string;
    draftId: string;
    retryCount?: number;
  };
  const tournament = (await LeagueTournamentModel.findById(
    tournamentId,
  ).populate<{ tierList: LeagueTierListDocument }>({
    path: "tierList",
  })) as
    | (LeagueTournamentDocument & { tierList: LeagueTierListDocument })
    | null;
  if (!tournament) {
    logger.error(
      `Tournament not found for skip-draft-pick job: ${tournamentId}`,
    );
    return;
  }
  const draft = await findPopulatedDraft(draftId);
  if (!draft) {
    logger.error(`Draft not found for skip-draft-pick job: ${draftId}`);
    return;
  }
  logger.info(
    `Executing skip-draft-pick for tournament ${tournament.name}, draft ${draft.name}`,
  );
  const skipped = await skipCurrentPick(tournament, draft);
  if (skipped) {
    return;
  }

  const latestDraft = await DraftMongooseModel.findById(draftId);
  if (
    !latestDraft ||
    latestDraft.status !== "IN_PROGRESS" ||
    !latestDraft.skipTime
  ) {
    return;
  }

  const retryTime = new Date(Date.now() + SKIP_RETRY_DELAY_MS);
  if (latestDraft.skipTime.getTime() > retryTime.getTime()) {
    return;
  }

  if (retryCount >= SKIP_MAX_RETRIES) {
    logger.warn(
      `skip-draft-pick reached max retries for tournament ${tournament.name}, draft ${draft.name}`,
    );
    return;
  }

  logger.warn(
    `skip-draft-pick no-op for tournament ${tournament.name}, draft ${draft.name}; retrying in 1 minute (${retryCount + 1}/${SKIP_MAX_RETRIES})`,
  );
  job.schedule(retryTime);
  job.attrs.data = {
    tournamentId,
    draftId,
    retryCount: retryCount + 1,
  };
  await job.save();
});

agenda.define("skip-draft-reminder", async (job: Job) => {
  if (isDev) return;
  const { tournamentId, draftId, skipTime } = job.attrs.data as {
    tournamentId: string;
    draftId: string;
    skipTime?: string | Date;
  };
  const league = await LeagueTournamentModel.findById(tournamentId).populate({
    path: "tierList",
  });
  if (!league) {
    console.error(`League not found: ${tournamentId}`);
    return;
  }
  const draft = await findPopulatedDraft(draftId);
  if (!draft) {
    console.error(`Draft not found: ${draftId} in league ${tournamentId}`);
    return;
  }

  if (draft.status !== "IN_PROGRESS" || !draft.skipTime) return;

  if (skipTime) {
    const expectedTime = new Date(skipTime).getTime();
    if (Math.abs(draft.skipTime.getTime() - expectedTime) > 1000) return;
  }

  const currentTeam = getCurrentPickingTeam(draft);
  if (!currentTeam || !draft.channelId) return;

  const coach = currentTeam.coach;
  const teamName = currentTeam.teamName ?? "Unknown Team";
  const coachMention = await resolveDiscordMention(
    draft.channelId,
    coach?.discordName,
  );
  const coachLabel = coachMention ?? "coach";
  await sendDiscordMessage(
    draft.channelId,
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
  draft: DraftDocument,
) {
  await agenda.start();
  const now = new Date();
  now.setSeconds(now.getSeconds() + draft.timerLength!);
  draft.skipTime = now;
  await agenda.schedule(draft.skipTime, "skip-draft-pick", {
    tournamentId: league._id,
    draftId: draft._id,
  });
  await scheduleSkipReminder(league, draft);
}

export async function cancelSkipPick(draft: DraftDocument) {
  await agenda.start();
  await agenda.cancel({
    name: "skip-draft-pick",
    data: { draftId: draft._id },
  });
  await agenda.cancel({
    name: "skip-draft-reminder",
    data: { draftId: draft._id },
  });
}

export async function resumeSkipPick(
  league: LeagueTournamentDocument,
  draft: DraftDocument,
) {
  await agenda.start();
  if (draft.skipTime)
    await agenda.schedule(draft.skipTime, "skip-draft-pick", {
      tournamentId: league._id,
      draftId: draft._id,
    });
  await scheduleSkipReminder(league, draft);
}

async function scheduleSkipReminder(
  league: LeagueTournamentDocument,
  draft: DraftDocument,
) {
  if (!draft.skipTime) {
    return;
  }

  const timeToSkipSeconds = (draft.skipTime.getTime() - Date.now()) / 1000;
  if (timeToSkipSeconds <= SKIP_REMINDER_THRESHOLD_SECONDS) {
    return;
  }

  const reminderTime = new Date(draft.skipTime.getTime() - ONE_HOUR_MS);
  if (reminderTime.getTime() <= Date.now()) {
    return;
  }

  await agenda.schedule(reminderTime, "skip-draft-reminder", {
    tournamentId: league._id,
    draftId: draft._id,
    skipTime: draft.skipTime,
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
