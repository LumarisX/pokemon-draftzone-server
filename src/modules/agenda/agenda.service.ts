import { getCurrentPickingTeam } from "@modules/draft/domain/pick-order";
import { DraftEngineService } from "@modules/draft/draft-engine.service";
import {
  DraftRepository,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { DraftDocument } from "@modules/draft/draft.schema";
import { DiscordService } from "@modules/discord/discord.service";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { UploadsService } from "@modules/upload/upload.service";
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Agenda, Job } from "agenda";
import { AGENDA_CLIENT } from "./agenda.constants";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SKIP_REMINDER_THRESHOLD_SECONDS = ONE_HOUR_MS + 1;
const SKIP_RETRY_DELAY_MS = 60 * 1000;
const SKIP_MAX_RETRIES = 10;

/**
 * Nest-DI home for the `agenda` job-scheduling library: skip-draft-pick
 * timers, the skip-draft-reminder Discord ping, and a daily file-upload
 * cleanup cron. Job handlers are registered in onModuleInit (so they only
 * run under the NestJS bootstrap, i.e. main.ts — see the plan note on
 * src/index.ts), and resolve data via real repositories/services instead of
 * raw Mongoose model lookups or legacy free functions.
 */
@Injectable()
export class AgendaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    @Inject(AGENDA_CLIENT) private readonly agenda: Agenda,
    private readonly draftRepo: DraftRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly discordService: DiscordService,
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => DraftEngineService))
    private readonly draftEngine: DraftEngineService,
  ) {}

  async onModuleInit() {
    this.agenda.define("skip-draft-pick", (job: Job) =>
      this.handleSkipDraftPick(job),
    );
    this.agenda.define("skip-draft-reminder", (job: Job) =>
      this.handleSkipDraftReminder(job),
    );
    this.agenda.define("cleanup-file-uploads", () =>
      this.handleCleanupFileUploads(),
    );

    await this.agenda.start();

    if (this.isDev()) {
      this.logger.log("Skipping recurring jobs in development mode");
      return;
    }

    // TEMPORARILY DISABLED: nothing yet calls UploadsService.confirmUpload()
    // when a key is actually saved/used (e.g. as a team logo), so every
    // upload record stays "pending" forever. Re-enabling this would delete
    // ALL uploads older than 24h, not just abandoned ones. Re-enable once
    // confirmUpload() is wired into the modules that persist upload keys.
    // await this.agenda.every("0 3 * * *", "cleanup-file-uploads");
    // this.logger.log("Scheduled recurring file upload cleanup job");
  }

  async onModuleDestroy() {
    await this.agenda.stop();
  }

  private isDev(): boolean {
    return this.configService.get<string>("NODE_ENV") === "development";
  }

  private async findPopulatedTournament(
    tournamentId: string,
  ): Promise<PopulatedTournament | null> {
    const tournament = await this.hostedTournamentRepo
      .findById(tournamentId)
      .catch(() => null);
    if (!tournament) return null;

    const tierList = await this.tierListRepo.findById(tournament.tierListId);
    return Object.assign(tournament, { tierList }) as PopulatedTournament;
  }

  private async handleSkipDraftPick(job: Job) {
    if (this.isDev()) return;
    const {
      tournamentId,
      draftId,
      retryCount = 0,
    } = job.attrs.data as {
      tournamentId: string;
      draftId: string;
      retryCount?: number;
    };
    const tournament = await this.findPopulatedTournament(tournamentId);
    if (!tournament) {
      this.logger.error(
        `Tournament not found for skip-draft-pick job: ${tournamentId}`,
      );
      return;
    }
    const draft = await this.draftRepo
      .findPopulatedById(draftId)
      .catch(() => null);
    if (!draft) {
      this.logger.error(`Draft not found for skip-draft-pick job: ${draftId}`);
      return;
    }
    this.logger.log(
      `Executing skip-draft-pick for tournament ${tournament.name}, draft ${draft.name}`,
    );
    const skipped = await this.draftEngine.skipCurrentPick(tournament, draft);
    if (skipped) {
      return;
    }

    const latestDraft = await this.draftRepo.findById(draftId);
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
      this.logger.warn(
        `skip-draft-pick reached max retries for tournament ${tournament.name}, draft ${draft.name}`,
      );
      return;
    }

    this.logger.warn(
      `skip-draft-pick no-op for tournament ${tournament.name}, draft ${draft.name}; retrying in 1 minute (${retryCount + 1}/${SKIP_MAX_RETRIES})`,
    );
    job.schedule(retryTime);
    job.attrs.data = {
      tournamentId,
      draftId,
      retryCount: retryCount + 1,
    };
    await job.save();
  }

  private async handleSkipDraftReminder(job: Job) {
    if (this.isDev()) return;
    const { tournamentId, draftId, skipTime } = job.attrs.data as {
      tournamentId: string;
      draftId: string;
      skipTime?: string | Date;
    };
    const tournament = await this.hostedTournamentRepo
      .findById(tournamentId)
      .catch(() => null);
    if (!tournament) {
      this.logger.error(`Tournament not found: ${tournamentId}`);
      return;
    }
    const draft = await this.draftRepo
      .findPopulatedById(draftId)
      .catch(() => null);
    if (!draft) {
      this.logger.error(
        `Draft not found: ${draftId} in league ${tournamentId}`,
      );
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
    const coachMention = await this.discordService.resolveMention(
      draft.channelId,
      coach?.discordName,
    );
    const coachLabel = coachMention ?? "coach";
    await this.discordService.sendMessage(draft.channelId, {
      content: `${teamName} (${coachLabel}) has 1 hour remaining!`,
    });
  }

  private async handleCleanupFileUploads() {
    try {
      const { deletedOrphans, deletedOldRecords } =
        await this.uploadsService.cleanupOrphanedUploads();

      this.logger.log(
        `File upload cleanup: ${deletedOrphans} orphaned uploads, ${deletedOldRecords} old deleted records`,
      );
    } catch (error) {
      this.logger.error("File upload cleanup error:", error);
    }
  }

  async scheduleSkipPick(
    tournament: PopulatedTournament,
    draft: DraftDocument,
  ) {
    await this.agenda.start();
    const now = new Date();
    now.setSeconds(now.getSeconds() + draft.timerLength!);
    draft.skipTime = now;
    await this.agenda.schedule(draft.skipTime, "skip-draft-pick", {
      tournamentId: tournament.id,
      draftId: draft._id,
    });
    await this.scheduleSkipReminder(tournament, draft);
  }

  async cancelSkipPick(draft: DraftDocument) {
    await this.agenda.start();
    await this.agenda.cancel({
      name: "skip-draft-pick",
      data: { draftId: draft._id },
    });
    await this.agenda.cancel({
      name: "skip-draft-reminder",
      data: { draftId: draft._id },
    });
  }

  async resumeSkipPick(tournament: PopulatedTournament, draft: DraftDocument) {
    await this.agenda.start();
    if (draft.skipTime)
      await this.agenda.schedule(draft.skipTime, "skip-draft-pick", {
        tournamentId: tournament.id,
        draftId: draft._id,
      });
    await this.scheduleSkipReminder(tournament, draft);
  }

  private async scheduleSkipReminder(
    tournament: PopulatedTournament,
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

    await this.agenda.schedule(reminderTime, "skip-draft-reminder", {
      tournamentId: tournament.id,
      draftId: draft._id,
      skipTime: draft.skipTime,
    });
  }
}
