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
const SKIP_RETRY_DELAY_MS = 60 * 1000;
const SKIP_MAX_RETRIES = 10;
/** How far draft.skipTime may drift from a job's own copy before the job is
 * considered stale (i.e. left over from a previous pick / pause cycle). */
const SKIP_TIME_TOLERANCE_MS = 1000;

const SKIP_PICK_JOB = "skip-draft-pick";
const SKIP_REMINDER_JOB = "skip-draft-reminder";
const DRAFT_JOB_NAMES = [SKIP_PICK_JOB, SKIP_REMINDER_JOB] as const;

type SkipJobData = {
  tournamentId: string;
  draftId: string;
  skipTime?: string | Date;
  retryCount?: number;
};

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
    this.agenda.define(SKIP_PICK_JOB, (job: Job) =>
      this.handleSkipDraftPick(job),
    );
    this.agenda.define(SKIP_REMINDER_JOB, (job: Job) =>
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

    await this.reconcileDraftJobs();

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
    const {
      tournamentId,
      draftId,
      skipTime: expectedSkipTime,
      retryCount = 0,
    } = job.attrs.data as SkipJobData;
    this.logger.log(
      `skip-draft-pick fired for draft ${draftId} (expectedSkipTime=${expectedSkipTime ? new Date(expectedSkipTime).toISOString() : "none"}, retryCount=${retryCount}, isDev=${this.isDev()})`,
    );
    if (this.isDev()) return;
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

    // Last line of defence against a leftover job: if the draft's clock has
    // moved on (paused, already advanced, timer turned off) this job is not the
    // authority for the current pick, so drop it rather than skip anyone.
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
      (driftMs !== undefined && driftMs > SKIP_TIME_TOLERANCE_MS)
    ) {
      this.logger.warn(
        `Discarding stale skip-draft-pick job for draft ${draft.name} ` +
          `(status=${draft.status}, noTimer=${draft.noTimer}, draft.skipTime=${draft.skipTime?.toISOString() ?? "none"}, driftMs=${driftMs ?? "n/a"})`,
      );
      await job.remove();
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
      skipTime: latestDraft.skipTime,
      retryCount: retryCount + 1,
    } satisfies SkipJobData;
    await job.save();
  }

  private async handleSkipDraftReminder(job: Job) {
    if (this.isDev()) return;
    const { tournamentId, draftId, skipTime } = job.attrs.data as SkipJobData;
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

  // ---------------------------------------------------------------------
  // Skip-timer jobs
  //
  // Invariant: a draft has AT MOST ONE skip-draft-pick job and AT MOST ONE
  // skip-draft-reminder job, and their run times always match draft.skipTime.
  // Every write goes through resumeSkipPick()/cancelSkipPick(), which are
  // idempotent — callers can invoke them as often as they like.
  // ---------------------------------------------------------------------

  private draftIdOf(draft: DraftDocument): string {
    return String(draft._id);
  }

  /**
   * Jobs of `name` belonging to `draftId`. Filtering in memory (rather than
   * with a `data.draftId` query) is deliberate: older jobs stored draftId as an
   * ObjectId while new ones store a string, and a Mongo equality match will not
   * span both. There is only ever a handful of skip jobs alive at once.
   */
  private async findDraftJobs(name: string, draftId: string) {
    const { jobs } = await this.agenda.queryJobs({ name });
    return jobs.filter(
      (job) => String((job.data as SkipJobData | undefined)?.draftId) === draftId,
    );
  }

  /** Deletes every `name` job for the draft except `keepJobId`. */
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

  /**
   * Writes the single job of `name` for this draft, then sweeps up anything the
   * upsert could not collapse. `unique()` makes the write an upsert keyed on
   * (name, data.draftId) so two concurrent callers update one document instead
   * of inserting two; the sweep afterwards catches legacy documents and the
   * narrow window where two upserts insert simultaneously.
   */
  private async upsertDraftJob(
    name: string,
    draftId: string,
    runAt: Date,
    data: SkipJobData,
  ) {
    const job = await this.agenda
      .create(name, data)
      .unique({ "data.draftId": draftId })
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

  async scheduleSkipPick(
    tournament: PopulatedTournament,
    draft: DraftDocument,
  ) {
    const skipTime = new Date();
    skipTime.setSeconds(skipTime.getSeconds() + draft.timerLength!);
    draft.skipTime = skipTime;
    draft.remainingTime = undefined;
    await this.resumeSkipPick(tournament, draft);
  }

  /** Deletes every skip job for the draft. Safe to call when none exist. */
  async cancelSkipPick(draft: DraftDocument) {
    await this.agenda.start();
    const draftId = this.draftIdOf(draft);
    let removed = 0;
    for (const name of DRAFT_JOB_NAMES) {
      removed += await this.removeDraftJobs(name, draftId);
    }
    return removed;
  }

  /**
   * Makes the stored jobs match the draft's current timer state: one skip job
   * at draft.skipTime plus an optional 1-hour reminder, or no jobs at all when
   * the draft is paused, finished, or running without a timer.
   */
  async resumeSkipPick(tournament: PopulatedTournament, draft: DraftDocument) {
    await this.agenda.start();
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
    });

    await this.syncSkipReminder(tournament, draftId, skipTime);
  }

  private async syncSkipReminder(
    tournament: PopulatedTournament,
    draftId: string,
    skipTime: Date,
  ) {
    const reminderTime = new Date(skipTime.getTime() - ONE_HOUR_MS);
    if (reminderTime.getTime() <= Date.now()) {
      // Less than an hour left — a reminder would fire immediately or late.
      await this.removeDraftJobs(SKIP_REMINDER_JOB, draftId);
      return;
    }

    await this.upsertDraftJob(SKIP_REMINDER_JOB, draftId, reminderTime, {
      tournamentId: tournament.id,
      draftId,
      skipTime,
    });
  }

  /**
   * Startup sweep. Drops skip jobs whose draft no longer has a running timer
   * and collapses any duplicates left behind by older builds, so a restart is
   * always enough to recover from a corrupted job collection.
   */
  private async reconcileDraftJobs() {
    try {
      const groups = new Map<string, { id: string; runAt: number }[]>();
      for (const name of DRAFT_JOB_NAMES) {
        const { jobs } = await this.agenda.queryJobs({ name });
        for (const job of jobs) {
          const draftId = (job.data as SkipJobData | undefined)?.draftId;
          if (!draftId) continue;
          const key = `${name}|${String(draftId)}`;
          groups.set(key, [
            ...(groups.get(key) ?? []),
            { id: String(job._id), runAt: job.nextRunAt?.getTime() ?? 0 },
          ]);
        }
      }

      let removed = 0;
      for (const [key, jobs] of groups) {
        const [name, draftId] = key.split("|");
        const draft = await this.draftRepo.findById(draftId).catch(() => null);
        const skipTime = draft?.skipTime;
        const timerRunning =
          !!draft && draft.status === "IN_PROGRESS" && !draft.noTimer && !!skipTime;

        let doomed: string[];
        if (!timerRunning || !skipTime) {
          doomed = jobs.map((job) => job.id);
        } else {
          // Several jobs for one draft: keep the one whose run time agrees with
          // the draft's own clock, drop the rest.
          const target =
            name === SKIP_PICK_JOB
              ? skipTime.getTime()
              : skipTime.getTime() - ONE_HOUR_MS;
          const keep = jobs.reduce((best, job) =>
            Math.abs(job.runAt - target) < Math.abs(best.runAt - target)
              ? job
              : best,
          );
          doomed = jobs.filter((job) => job.id !== keep.id).map((job) => job.id);
        }

        if (!doomed.length) continue;
        removed += await this.agenda.cancel({ ids: doomed });
      }

      if (removed) {
        this.logger.warn(`Reconciled draft jobs on startup: removed ${removed}`);
      }
    } catch (error) {
      this.logger.error("Failed to reconcile draft jobs on startup", error);
    }
  }
}
