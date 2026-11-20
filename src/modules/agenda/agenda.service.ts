import { nullIfNotFound } from "@core/pdz-error";
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
import { Agenda, Job, JobParameters } from "agenda";
import { Types } from "mongoose";
import { AGENDA_CLIENT } from "./agenda.constants";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SKIP_RETRY_DELAY_MS = 5 * 1000;
const SKIP_MAX_RETRIES = 10;
const SKIP_TIME_TOLERANCE_MS = 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const SKIP_PICK_JOB = "skip-draft-pick";
const SKIP_REMINDER_JOB = "skip-draft-reminder";
const DRAFT_JOB_NAMES = [SKIP_PICK_JOB, SKIP_REMINDER_JOB] as const;

type SkipJobData = {
  tournamentId: string;
  draftId: string;
  skipTime?: string | Date;
  counter?: number;
  retryCount?: number;
};

function jobStillCounts(job: JobParameters): boolean {
  if (job.lockedAt || job.nextRunAt) return true;
  if (!job.lastFinishedAt) return false;
  return !job.failedAt || job.failedAt < job.lastFinishedAt;
}

@Injectable()
export class AgendaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgendaService.name);
  private sweepTimer?: ReturnType<typeof setInterval>;
  private sweeping = false;

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
    this.agenda.define(SKIP_PICK_JOB, (job: Job) =>
      this.handleSkipDraftPick(job),
    );
    this.agenda.define(SKIP_REMINDER_JOB, (job: Job) =>
      this.handleSkipDraftReminder(job),
    );
    this.agenda.define("cleanup-file-uploads", () =>
      this.handleCleanupFileUploads(),
    );

    if (this.isDev()) {
      this.logger.log(
        "Job runner not started in development mode; recurring jobs skipped",
      );
      return;
    }

    await this.reconcileDraftJobs();

    await this.agenda.start();

    this.sweepTimer = setInterval(
      () => void this.ensureDraftJobs(),
      SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref?.();

    await this.agenda.every("0 3 * * *", "cleanup-file-uploads");
    this.logger.log("Scheduled recurring file upload cleanup job");
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    await this.agenda.stop();
  }

  async ensureDraftJobs(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const running = (await this.draftRepo.findRunningTimed()).filter(
        (draft) => !!draft.skipTime,
      );
      if (!running.length) return 0;

      const { jobs } = await this.agenda.queryJobs({ name: SKIP_PICK_JOB });
      let recreated = 0;
      for (const draft of running) {
        const draftId = this.draftIdOf(draft);
        const covered = jobs.some((job) => {
          const data = job.data as SkipJobData | undefined;
          return (
            String(data?.draftId) === draftId &&
            !!data?.skipTime &&
            Math.abs(
              new Date(data.skipTime).getTime() - draft.skipTime!.getTime(),
            ) <= SKIP_TIME_TOLERANCE_MS &&
            jobStillCounts(job)
          );
        });
        if (covered) continue;

        await this.resumeSkipPick({ id: String(draft.tournamentId) }, draft);
        recreated += 1;
      }

      if (recreated)
        this.logger.warn(
          `Recreated ${recreated} missing skip-draft-pick job(s)`,
        );
      return recreated;
    } catch (error) {
      this.logger.error("Failed to check draft jobs", error);
      return 0;
    } finally {
      this.sweeping = false;
    }
  }

  private isDev(): boolean {
    return this.configService.get<string>("NODE_ENV") === "development";
  }

  private async findPopulatedTournament(
    tournamentId: string,
  ): Promise<PopulatedTournament | null> {
    const tournament = await nullIfNotFound(
      this.hostedTournamentRepo.findById(tournamentId),
    );
    if (!tournament) return null;

    const tierList = await this.tierListRepo.findById(tournament.tierListId);
    return Object.assign(tournament, { tierList }) as PopulatedTournament;
  }

  private async handleSkipDraftPick(job: Job) {
    const data = job.attrs.data as SkipJobData;
    const {
      tournamentId,
      draftId,
      skipTime: expectedSkipTime,
      counter: expectedCounter,
      retryCount = 0,
    } = data;
    this.logger.log(
      `skip-draft-pick fired for draft ${draftId} (expectedSkipTime=${expectedSkipTime ? new Date(expectedSkipTime).toISOString() : "none"}, counter=${expectedCounter ?? "none"}, retryCount=${retryCount}, isDev=${this.isDev()})`,
    );
    if (this.isDev()) return;
    const tournament = await this.findPopulatedTournament(tournamentId);
    if (!tournament) {
      this.logger.error(
        `Tournament not found for skip-draft-pick job: ${tournamentId}`,
      );
      return;
    }
    const draft = await nullIfNotFound(this.draftRepo.findPopulatedById(draftId));
    if (!draft) {
      this.logger.error(`Draft not found for skip-draft-pick job: ${draftId}`);
      return;
    }

    const driftMs =
      expectedSkipTime && draft.skipTime
        ? Math.abs(
            draft.skipTime.getTime() - new Date(expectedSkipTime).getTime(),
          )
        : undefined;
    if (
      draft.status !== "IN_PROGRESS" ||
      draft.noTimer ||
      !draft.skipTime ||
      (driftMs !== undefined && driftMs > SKIP_TIME_TOLERANCE_MS) ||
      (expectedCounter !== undefined && draft.counter !== expectedCounter)
    ) {
      this.logger.warn(
        `Discarding stale skip-draft-pick job for draft ${draft.name} ` +
          `(status=${draft.status}, noTimer=${draft.noTimer}, draft.skipTime=${draft.skipTime?.toISOString() ?? "none"}, driftMs=${driftMs ?? "n/a"}, counter=${draft.counter}, expectedCounter=${expectedCounter ?? "n/a"})`,
      );
      await job.remove();
      return;
    }

    this.logger.log(
      `Executing skip-draft-pick for tournament ${tournament.name}, draft ${draft.name}`,
    );
    const outcome = await this.draftEngine.skipCurrentPick(tournament, draft, {
      counter: expectedCounter ?? draft.counter,
      skipTime: expectedSkipTime ? new Date(expectedSkipTime) : undefined,
    });
    if (outcome !== "busy") return;

    if (retryCount >= SKIP_MAX_RETRIES) {
      this.logger.warn(
        `skip-draft-pick reached max retries for tournament ${tournament.name}, draft ${draft.name}`,
      );
      return;
    }

    this.logger.warn(
      `skip-draft-pick for tournament ${tournament.name}, draft ${draft.name} met a concurrent change; retrying (${retryCount + 1}/${SKIP_MAX_RETRIES})`,
    );
    await this.agenda
      .create(SKIP_PICK_JOB, { ...data, retryCount: retryCount + 1 })
      .unique(this.uniqueKey({ ...data, retryCount: retryCount + 1 }))
      .schedule(new Date(Date.now() + SKIP_RETRY_DELAY_MS))
      .save();
  }

  private uniqueKey(data: SkipJobData) {
    return {
      "data.draftId": data.draftId,
      "data.skipTime": data.skipTime,
      "data.retryCount": data.retryCount ?? 0,
    };
  }

  private async handleSkipDraftReminder(job: Job) {
    if (this.isDev()) return;
    const { tournamentId, draftId, skipTime } = job.attrs.data as SkipJobData;
    const tournament = await nullIfNotFound(
      this.hostedTournamentRepo.findById(tournamentId),
    );
    if (!tournament) {
      this.logger.error(`Tournament not found: ${tournamentId}`);
      return;
    }
    const draft = await nullIfNotFound(this.draftRepo.findPopulatedById(draftId));
    if (!draft) {
      this.logger.error(
        `Draft not found: ${draftId} in league ${tournamentId}`,
      );
      return;
    }

    if (draft.status !== "IN_PROGRESS" || draft.noTimer || !draft.skipTime)
      return;

    if (skipTime) {
      const expectedTime = new Date(skipTime).getTime();
      if (
        Math.abs(draft.skipTime.getTime() - expectedTime) >
        SKIP_TIME_TOLERANCE_MS
      )
        return;
    }

    const currentTeam = draft.sequentialTurns
      ? getCurrentPickingTeam(draft, tournament.draftCount.max)
      : null;
    if (!currentTeam || !draft.channelId) return;

    const coach = currentTeam.primaryCoach;
    const teamName = currentTeam.teamName ?? "Unknown Team";
    const coachLabel =
      this.discordService.mention(coach?.discordId) ?? coach?.name ?? "coach";
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

  private draftIdOf(draft: DraftDocument): string {
    return String(draft._id);
  }

  private async findDraftJobs(name: string, draftId: string) {
    const { jobs } = await this.agenda.queryJobs({ name });
    return jobs.filter(
      (job) => String((job.data as SkipJobData | undefined)?.draftId) === draftId,
    );
  }

  private async removeDraftJobs(
    name: string,
    draftId: string,
    keepJobId?: string,
  ): Promise<number> {
    const ids = (await this.findDraftJobs(name, draftId))
      .map((job) => String(job._id))
      .filter((id) => id !== keepJobId);
    if (!ids.length) return 0;
    return this.agenda.cancel({ ids });
  }

  private async upsertDraftJob(
    name: string,
    draftId: string,
    runAt: Date,
    data: SkipJobData,
  ) {
    const job = await this.agenda
      .create(name, data)
      .unique(this.uniqueKey(data))
      .schedule(runAt)
      .save();

    const removed = await this.removeDraftJobs(
      name,
      draftId,
      String(job.attrs._id),
    );
    if (removed) {
      this.logger.warn(
        `Removed ${removed} duplicate ${name} job(s) for draft ${draftId}`,
      );
    }
    return job;
  }

  async cancelSkipPick(draft: DraftDocument) {
    const draftId = this.draftIdOf(draft);
    let removed = 0;
    for (const name of DRAFT_JOB_NAMES) {
      removed += await this.removeDraftJobs(name, draftId);
    }
    return removed;
  }

  async resumeSkipPick(
    tournament: Pick<PopulatedTournament, "id">,
    draft: DraftDocument,
  ) {
    const draftId = this.draftIdOf(draft);
    const skipTime = draft.skipTime;

    const timerRunning =
      draft.status === "IN_PROGRESS" && !draft.noTimer && !!skipTime;
    if (!timerRunning || !skipTime) {
      this.logger.log(
        `resumeSkipPick clearing jobs for draft ${draftId} (status=${draft.status}, noTimer=${draft.noTimer}, skipTime=${skipTime?.toISOString() ?? "none"})`,
      );
      await this.cancelSkipPick(draft);
      return;
    }

    this.logger.log(
      `resumeSkipPick scheduling skip-draft-pick for draft ${draftId} at ${skipTime.toISOString()}`,
    );
    await this.upsertDraftJob(SKIP_PICK_JOB, draftId, skipTime, {
      tournamentId: tournament.id,
      draftId,
      skipTime,
      counter: draft.counter,
      retryCount: 0,
    });

    await this.syncSkipReminder(tournament, draftId, skipTime);
  }

  private async syncSkipReminder(
    tournament: Pick<PopulatedTournament, "id">,
    draftId: string,
    skipTime: Date,
  ) {
    const reminderTime = new Date(skipTime.getTime() - ONE_HOUR_MS);
    if (reminderTime.getTime() <= Date.now()) {
      await this.removeDraftJobs(SKIP_REMINDER_JOB, draftId);
      return;
    }

    await this.upsertDraftJob(SKIP_REMINDER_JOB, draftId, reminderTime, {
      tournamentId: tournament.id,
      draftId,
      skipTime,
    });
  }

  private async reconcileDraftJobs() {
    try {
      const now = Date.now();
      const running = await this.draftRepo.findRunningTimed();
      const onTime = running.filter(
        (draft) => !!draft.skipTime && draft.skipTime.getTime() > now,
      );
      const overdue = running.filter((draft) => !onTime.includes(draft));
      const keepJobsFor = new Set(onTime.map((draft) => this.draftIdOf(draft)));

      let removed = 0;
      for (const name of DRAFT_JOB_NAMES) {
        const { jobs } = await this.agenda.queryJobs({ name });
        const doomed = jobs
          .filter(
            (job) =>
              !keepJobsFor.has(
                String((job.data as SkipJobData | undefined)?.draftId),
              ),
          )
          .map((job) => String(job._id));
        if (doomed.length) removed += await this.agenda.cancel({ ids: doomed });
      }

      for (const draft of onTime)
        await this.resumeSkipPick(
          { id: String(draft.tournamentId) },
          draft,
        );

      let restarted = 0;
      for (const draft of overdue)
        if (await this.restartOverdueClock(draft)) restarted += 1;

      if (removed || restarted) {
        this.logger.warn(
          `Reconciled draft jobs on startup: removed ${removed}, restarted ${restarted} overdue clock(s)`,
        );
      }
    } catch (error) {
      this.logger.error("Failed to reconcile draft jobs on startup", error);
    }
  }

  private async restartOverdueClock(draft: DraftDocument): Promise<boolean> {
    const tournament = await this.findPopulatedTournament(
      String(draft.tournamentId),
    );
    const populated = await nullIfNotFound(
      this.draftRepo.findPopulatedById(this.draftIdOf(draft)),
    );
    if (!tournament || !populated) return false;
    await this.draftEngine.restartClock(tournament, populated);
    return true;
  }
}
