import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachDocument } from "@modules/coach/coach.schema";
import { DiscordService } from "@modules/discord/discord.service";
import { getName, getSpecies, getSpriteId } from "@modules/data/domain/pokedex";
import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { TeamPickEntity } from "@modules/team/team.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { AgendaService } from "@modules/agenda/agenda.service";
import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import { toID, TypeName } from "@pkmn/data";
import { EmbedBuilder, EmbedField } from "discord.js";
import { ClientSession, Connection, Types } from "mongoose";
import { actingCoach, activeCoaches } from "@modules/tournament/membership";
import {
  DraftDto,
  DraftStateAction,
  isDraftStateAction,
  SetDraftOrderDto,
  UpdateDraftSettingsDto,
} from "./draft.dto";
import { DraftDocument, DraftEntity } from "./draft.schema";
import { draftAudience, DraftEventsService } from "./draft-events.service";
import { duplicatesAllowed, picksAreBlind } from "./domain/pick-visibility";
import type { DraftPickUpdatedEvent } from "./draft-events.service";
import {
  calculateTeamTimer,
  cancelSkipTime,
  canTeamDraft,
  getCurrentPickingTeam,
  getCurrentRound,
  getDocumentId,
  getPokemonIdFromDraft,
  getTeamPickSlot,
  isPreDraftStatus,
} from "./domain/pick-order";
import {
  canBeDrafted,
  canBeDraftedWithReason,
  createPokemonTierMap,
  getPickCost,
  isDraftComplete,
  isTeamDoneDrafting,
  owedPicks,
} from "./domain/tier-cost";
import { turnState } from "./domain/turn-state";

type DeferredSideEffect = () => void | Promise<void>;
const sessionSideEffects = new WeakMap<ClientSession, DeferredSideEffect[]>();

const typeColorMap = new Map<TypeName, number>([
  ["Bug", 0x91a119],
  ["Dark", 0x50413f],
  ["Dragon", 0x5060e1],
  ["Electric", 0xfac000],
  ["Fairy", 0xef70ef],
  ["Fighting", 0xff8000],
  ["Fire", 0xe62829],
  ["Flying", 0x81b9ef],
  ["Ghost", 0x704170],
  ["Grass", 0x3fa129],
  ["Ground", 0x915121],
  ["Ice", 0x3fd8ff],
  ["Normal", 0x9fa19f],
  ["Poison", 0x9141cb],
  ["Psychic", 0xef4179],
  ["Rock", 0xafa981],
  ["Steel", 0x60a1b8],
  ["Water", 0x2980ef],
]);

const DEFAULT_CLIENT_URL = "https://pokemondraftzone.com";

const WRITE_CONFLICT = 112;

function isTransactionConflict(error: unknown): boolean {
  const mongoError = error as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
  };
  return (
    mongoError?.code === WRITE_CONFLICT ||
    mongoError?.hasErrorLabel?.("TransientTransactionError") === true
  );
}

function queueSideEffect(
  session: ClientSession | undefined,
  effect: DeferredSideEffect,
) {
  if (!session) {
    void Promise.resolve(effect()).catch((error) =>
      console.error("Error executing side effect:", error),
    );
    return;
  }

  const existingEffects = sessionSideEffects.get(session) || [];
  existingEffects.push(effect);
  sessionSideEffects.set(session, existingEffects);
}

const sideEffectLogger = new Logger("DraftSideEffects");

async function flushSideEffects(session: ClientSession) {
  const effects = sessionSideEffects.get(session) || [];
  sessionSideEffects.delete(session);
  for (const effect of effects) {
    try {
      await effect();
    } catch (error) {
      sideEffectLogger.error(
        "A draft side effect failed after its change was saved",
        error instanceof Error ? error.stack : error,
      );
    }
  }
}

export type SkipOutcome = "skipped" | "stale" | "busy";

export type ExpectedTurn = { counter: number; skipTime?: Date };

const SKIP_TIME_TOLERANCE_MS = 1000;

function clearSideEffects(session: ClientSession) {
  sessionSideEffects.delete(session);
}

function pickerFor(team: PopulatedTeam, actor?: string): Types.ObjectId {
  const picker =
    actingCoach(team, actor, "draft")?._id ??
    team.primaryCoach?._id ??
    activeCoaches(team)[0]?._id;
  if (!picker)
    throw new PDZError(ErrorCodes.TOURNAMENT.COACH_NOT_FOUND, {
      teamId: team._id.toString(),
    });
  return picker;
}

@Injectable()
export class DraftEngineService {
  private readonly logger = new Logger(DraftEngineService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly teamRepo: TeamRepository,
    private readonly discordService: DiscordService,
    private readonly draftEvents: DraftEventsService,
    @Inject(forwardRef(() => AgendaService))
    private readonly agendaService: AgendaService,
    private readonly configService: ConfigService,
  ) {}

  private draftUrl(tournament: PopulatedTournament, draft: PopulatedDraft) {
    const baseUrl = (
      this.configService.get<string>("CLIENT_URL") ?? DEFAULT_CLIENT_URL
    ).replace(/\/+$/, "");
    return `${baseUrl}/leagues/${tournament.leagueSlug}/tournaments/${tournament.slug}/pools/${draft.slug}/draft`;
  }

  private pickSummary(
    tournament: PopulatedTournament,
    pick: { pokemonId: string; addons?: string[] },
  ) {
    return {
      id: pick.pokemonId,
      name: getName(pick.pokemonId),
      tier: tournament.tierList.getPokemonTier(pick.pokemonId)?.name,
      cost: getPickCost(tournament.tierList, pick),
    };
  }

  private rosterSummary(tournament: PopulatedTournament, team: PopulatedTeam) {
    return team.pickLog.map((entry) =>
      this.pickSummary(tournament, {
        pokemonId: getPokemonIdFromDraft(entry),
        addons: entry.addons,
      }),
    );
  }

  private emitPickUpdated(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    detail: Pick<DraftPickUpdatedEvent, "round" | "pokemon" | "previous">,
  ) {
    this.draftEvents.emitDraftPickUpdated({
      tournamentSlug: tournament.slug,
      poolSlug: draft.slug,
      audience: draftAudience(draft, team._id.toString()),
      ...detail,
      team: {
        id: team._id.toString(),
        name: team.teamName,
        draft: this.rosterSummary(tournament, team),
      },
      ...turnState(tournament, draft),
    });
  }

  private onClockTeam(tournament: PopulatedTournament, draft: PopulatedDraft) {
    if (!draft.sequentialTurns) return null;
    return getCurrentPickingTeam(draft, tournament.draftCount.max);
  }

  private setTurnClock(
    draft: PopulatedDraft,
    team: PopulatedTeam | null,
    seconds?: number,
  ) {
    if (!team || !draft.sequentialTurns || draft.noTimer) {
      draft.skipTime = undefined;
      draft.remainingTime = undefined;
      return;
    }
    const length =
      seconds ?? calculateTeamTimer(draft.timerLength, team.skipCount || 0);
    if (draft.status === "IN_PROGRESS") {
      draft.skipTime = new Date(Date.now() + length * 1000);
      draft.remainingTime = undefined;
    } else {
      draft.skipTime = undefined;
      draft.remainingTime = length;
    }
  }

  private async sendDiscordPickUpdate(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    detail: Pick<DraftPickUpdatedEvent, "round" | "pokemon" | "previous">,
  ): Promise<void> {
    if (!draft.channelId || picksAreBlind(draft)) return;

    const channelId = draft.channelId;
    const { round, pokemon, previous } = detail;

    await team.populate<{ primaryCoach: CoachDocument; coaches: CoachDocument[] }>([
      "primaryCoach",
      "coaches",
    ]);
    const coachMention = await this.discordService.resolveMention(
      channelId,
      team.primaryCoach?.discordName,
    );

    const title = pokemon
      ? previous
        ? `${team.teamName}: ${previous.name} changed to ${pokemon.name}`
        : `${team.teamName} was given ${pokemon.name}`
      : `${team.teamName} lost ${previous?.name ?? "a pick"}`;

    const fields: EmbedField[] = [];
    if (round !== undefined)
      fields.push({ name: "Round", value: `${round + 1}`, inline: true });
    if (previous)
      fields.push({ name: "Previous", value: previous.name, inline: true });
    if (pokemon) {
      fields.push({
        name: "Tier",
        value: pokemon.tier ?? "Banned",
        inline: true,
      });
      if (pokemon.cost)
        fields.push({
          name: "Cost",
          value: pokemon.cost.toString(),
          inline: true,
        });
    }

    const spriteId = pokemon?.id ?? previous?.id;
    const specie = spriteId ? getSpecies(spriteId) : undefined;
    const color = specie?.types[0]
      ? typeColorMap.get(specie.types[0])
      : undefined;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color ?? 0xffde00)
      .setURL(this.draftUrl(tournament, draft))
      .addFields(fields)
      .setTimestamp();
    if (spriteId)
      embed.setImage(
        `https://play.pokemonshowdown.com/sprites/gen5/${getSpriteId(spriteId)}.png`,
      );

    await this.discordService.sendMessage(channelId, {
      content: `An organizer updated ${coachMention ?? "a coach"}'s roster.`,
      embeds: [embed],
    });
  }

  private async currentTeamPicks(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    session?: ClientSession,
  ): Promise<TeamPickEntity[] | null> {
    if (!team.picks.length || !team.picks[0].length) return null;

    const validationResults = await Promise.all(
      team.picks[0].map(async (pick) => ({
        pick,
        isValid: await canBeDrafted(tournament, draft, team, {
          pokemonId: pick.pokemonId,
          addons: pick.addons,
        }),
      })),
    );

    const picks = validationResults
      .filter((result) => result.isValid)
      .map((result) => result.pick);

    if (picks.length !== team.picks[0].length) {
      team.picks[0] = picks;
      await team.save({ session });
    }
    if (!picks.length) return null;
    return picks;
  }

  async autoDraftFromQueueIfOnClock(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    session?: ClientSession,
  ): Promise<void> {
    if (!draft.sequentialTurns) return;
    if (!(await canTeamDraft(draft, team, tournament.draftCount.max))) return;

    const queuedPicks = await this.currentTeamPicks(
      tournament,
      draft,
      team,
      session,
    );
    if (!queuedPicks?.length) return;

    await this.draftPokemon(tournament, draft, team, queuedPicks[0], session);
  }

  async draftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    pick: TeamPickEntity,
    session?: ClientSession,
    isOrganizerOverride = false,
    actor?: string,
  ) {
    let newSession = false;
    if (!session) {
      session = await this.connection.startSession();
      session.startTransaction();
      newSession = true;
    }

    let currentDraft = draft;
    let currentTeam = team;

    try {
      const dbTeam = currentDraft.teams.find((t: PopulatedTeam) =>
        t._id.equals(team._id),
      );
      if (!dbTeam) {
        throw new PDZError(ErrorCodes.DRAFT.TEAM_ID_NOT_FOUND);
      }
      currentTeam = dbTeam;

      if (!isOrganizerOverride && currentDraft.status !== "IN_PROGRESS") {
        throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
          reason: `Draft is currently ${currentDraft.status.toLowerCase().replace("_", " ")}.`,
        });
      }

      if (
        !isOrganizerOverride &&
        !(await canTeamDraft(
          currentDraft,
          currentTeam,
          tournament.draftCount.max,
        ))
      ) {
        throw new PDZError(ErrorCodes.DRAFT.NOT_YOUR_TURN);
      }

      const draftCheck = await canBeDraftedWithReason(
        tournament,
        currentDraft,
        currentTeam,
        pick,
      );
      if (!draftCheck.canDraft)
        throw new PDZError(ErrorCodes.DRAFT.INVALID_POKEMON, {
          reason: draftCheck.reason,
        });

      await this.claimPick(
        currentDraft,
        pick.pokemonId,
        session,
        !isOrganizerOverride,
      );

      const picker = pickerFor(currentTeam, actor);

      currentTeam.pickLog.push({
        pokemon: { id: toID(pick.pokemonId) },
        picker,
        addons: pick.addons,
        timestamp: new Date(),
      });

      if (currentTeam.picks.length > 0) {
        currentTeam.picks.shift();
      }

      currentTeam.picks = currentTeam.picks.map((round) =>
        round.filter((p) => p.pokemonId !== pick.pokemonId),
      );

      await currentTeam.save({ session });

      currentTeam = (await currentTeam.populate<{
        primaryCoach: CoachDocument;
        coaches: CoachDocument[];
      }>(["primaryCoach", "coaches"])) as unknown as PopulatedTeam;

      const currentTeamId = currentTeam._id.toString();

      const teamIndex = currentDraft.teams.findIndex(
        (t) => getDocumentId(t) === currentTeamId,
      );
      if (teamIndex !== -1) {
        currentDraft.teams[teamIndex] = currentTeam;
      }

      const tier = tournament.tierList.getPokemonTier(pick.pokemonId);

      const snipeCount = await this.removePokemonFromPicks(
        currentDraft,
        pick.pokemonId,
        session,
        currentTeamId,
      );
      await this.recordSnipes(currentDraft, snipeCount, session);

      const pokemonTierMap = createPokemonTierMap(tournament);
      const draftPicks = await Promise.all(
        currentTeam.pickLog.map(async (p) => ({
          id: getPokemonIdFromDraft(p),
          name: getName(getPokemonIdFromDraft(p)),
          tier: pokemonTierMap.get(getPokemonIdFromDraft(p)),
          cost: getPickCost(tournament.tierList, {
            pokemonId: getPokemonIdFromDraft(p),
            addons: p.addons,
          }),
        })),
      );

      queueSideEffect(session, () => {
        this.draftEvents.emitDraftAdded({
          tournamentSlug: tournament.slug,
          poolSlug: currentDraft.slug,
          audience: draftAudience(currentDraft, currentTeamId),
          pick: {
            pokemon: {
              id: pick.pokemonId,
              name: getName(pick.pokemonId),
              tier: tier?.name,
              cost: tier?.cost,
            },
            team: { id: currentTeamId, name: currentTeam.teamName },
            pool: currentDraft.name,
          },
          team: {
            id: currentTeamId,
            name: currentTeam.teamName,
            draft: draftPicks,
          },
          ...turnState(tournament, currentDraft),
        });
      });

      await this.queueDiscordDraftPick(
        tournament,
        currentDraft,
        currentTeam,
        pick,
        tier,
        snipeCount,
        session,
      );

      await this.handlePostPickState(
        tournament,
        currentDraft,
        currentTeam,
        session,
      );

      Object.assign(draft, currentDraft.toObject());
      Object.assign(team, currentTeam.toObject());

      if (newSession) await session.commitTransaction();
    } catch (error) {
      if (newSession) {
        await session.abortTransaction().catch(() => undefined);
        clearSideEffects(session);
        session.endSession();
      }
      if (isTransactionConflict(error))
        throw new PDZError(ErrorCodes.DRAFT.CHANGED);
      throw error;
    }

    if (newSession) {
      session.endSession();
      await flushSideEffects(session);
    }
  }

  private async lockDraft(draft: PopulatedDraft, session: ClientSession) {
    const fresh = await this.connection
      .model<DraftDocument>(DraftEntity.name)
      .findOneAndUpdate(
        { _id: draft._id },
        { $inc: { pickVersion: 1 } },
        { session, projection: { counter: 1, status: 1, skipTime: 1 } },
      )
      .lean()
      .exec();
    if (!fresh) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    return fresh;
  }

  private async inDraftTransaction<T>(
    draft: PopulatedDraft,
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    session.startTransaction();
    let result: T;
    try {
      const fresh = await this.lockDraft(draft, session);
      if (fresh.counter !== draft.counter || fresh.status !== draft.status)
        throw new PDZError(ErrorCodes.DRAFT.CHANGED);
      result = await work(session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      clearSideEffects(session);
      session.endSession();
      if (isTransactionConflict(error))
        throw new PDZError(ErrorCodes.DRAFT.CHANGED);
      throw error;
    }
    session.endSession();
    await flushSideEffects(session);
    return result;
  }

  private async claimPick(
    draft: PopulatedDraft,
    pokemonId: string,
    session: ClientSession,
    checkTurn: boolean,
  ) {
    const fresh = await this.lockDraft(draft, session);

    if (
      checkTurn &&
      (fresh.counter !== draft.counter || fresh.status !== draft.status)
    )
      throw new PDZError(ErrorCodes.DRAFT.CHANGED);

    if (
      !duplicatesAllowed(draft) &&
      (await this.teamRepo.isPokemonTakenInDraft(
        draft._id,
        toID(pokemonId),
        session,
      ))
    )
      throw new PDZError(ErrorCodes.DRAFT.ALREADY_DRAFTED, { pokemonId });
  }

  private async recordSnipes(
    draft: PopulatedDraft,
    snipeCount: number,
    session: ClientSession,
  ) {
    if (duplicatesAllowed(draft)) return;
    await this.connection
      .model<DraftDocument>(DraftEntity.name)
      .updateOne(
        { _id: draft._id },
        { $inc: { snipeCount } },
        { session },
      )
      .exec();
  }

  private async removePokemonFromPicks(
    draft: PopulatedDraft,
    pokemonId: string,
    session?: ClientSession,
    skipTeamId?: string,
  ) {
    if (duplicatesAllowed(draft)) return 0;

    let teamsToProcess = draft.teams;
    if (skipTeamId) {
      teamsToProcess = teamsToProcess.filter(
        (team: PopulatedTeam) => team._id.toString() !== skipTeamId,
      );
    }

    const teamsWithPick = teamsToProcess.filter((team: PopulatedTeam) =>
      team.picks.some((round) =>
        round.some((pick) => pick.pokemonId === pokemonId),
      ),
    );

    if (teamsWithPick.length > 0) {
      await Promise.all(
        teamsWithPick.map((team) => {
          team.picks = team.picks.map((round) =>
            round.filter((p) => p.pokemonId !== pokemonId),
          );
          return team.save({ session });
        }),
      );
    }

    return teamsWithPick.length;
  }

  private async queueDiscordDraftPick(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    pick: TeamPickEntity,
    tier: { cost: number; name?: string } | undefined,
    snipeCount: number,
    session: ClientSession | undefined,
  ): Promise<void> {
    if (!draft.channelId || picksAreBlind(draft)) return;

    const channelId = draft.channelId;
    const pokemonName = getName(pick.pokemonId);
    const pokemonSpecie = getSpecies(pick.pokemonId);

    await team.populate<{ primaryCoach: CoachDocument; coaches: CoachDocument[] }>([
      "primaryCoach",
      "coaches",
    ]);

    const coachMention = await this.discordService.resolveMention(
      channelId,
      team.primaryCoach?.discordName,
    );
    const messageContent = `${pokemonName} was drafted by ${coachMention ?? "a coach"}.`;

    const color = pokemonSpecie?.types[0]
      ? typeColorMap.get(pokemonSpecie.types[0])
      : undefined;

    const pickSlot = getTeamPickSlot(draft, team, team.pickLog.length - 1);
    const fields: EmbedField[] = [
      { name: "Round", value: `${pickSlot.round + 1}`, inline: true },
      {
        name: "Position",
        value: `${pickSlot.position + 1}`,
        inline: true,
      },
      {
        name: "Tier",
        value: tier?.name ?? "Banned",
        inline: true,
      },
    ];
    if (tier?.cost)
      fields.push({ name: "Cost", value: tier.cost.toString(), inline: true });
    if (pick.addons?.length)
      fields.push({ name: "Captain", value: "Tera", inline: true });
    if (snipeCount)
      fields.push({
        name: "Sniped Teams",
        value: snipeCount.toString(),
        inline: true,
      });

    queueSideEffect(session, () => {
      const embed = new EmbedBuilder()
        .setTitle(`${team.teamName} drafted ${pokemonName}!`)
        .setColor(color ?? 0xffde00)
        .setURL(this.draftUrl(tournament, draft))
        .addFields(fields)
        .setImage(
          `https://play.pokemonshowdown.com/sprites/gen5/${getSpriteId(pick.pokemonId)}.png`,
        )
        .setTimestamp();
      this.discordService.sendMessage(channelId, {
        content: messageContent,
        embeds: [embed],
      });
    });
  }

  private async handlePostPickState(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    session?: ClientSession,
  ) {
    if (!tournament.draftCount.max) return;
    if (draft.status !== "IN_PROGRESS" && draft.status !== "PAUSED") return;

    if (isDraftComplete(tournament, draft)) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    const onClock = this.onClockTeam(tournament, draft);
    if (!onClock || !onClock._id.equals(team._id)) return;

    const filledTurn = onClock.pickLog.length >= getCurrentRound(draft) + 1;
    if (filledTurn || isTeamDoneDrafting(tournament, draft, onClock)) {
      await this.advanceSequentialCounter(tournament, draft, session);
      return;
    }

    this.setTurnClock(draft, onClock);
    await draft.save({ session });
    queueSideEffect(session, async () => {
      await this.agendaService.resumeSkipPick(tournament, draft);
      this.emitCounter(tournament, draft, onClock);
    });
  }

  private skipToNextActiveTeam(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
  ): PopulatedTeam | null {
    let nextTeam = this.onClockTeam(tournament, draft);
    while (nextTeam && isTeamDoneDrafting(tournament, draft, nextTeam)) {
      draft.counter++;
      nextTeam = this.onClockTeam(tournament, draft);
    }
    return nextTeam;
  }

  private async advanceSequentialCounter(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session?: ClientSession,
  ) {
    if (draft.status !== "IN_PROGRESS" && draft.status !== "PAUSED") return;
    draft.counter++;
    await this.openNextTurn(tournament, draft, session, { announce: true });
  }

  private async openNextTurn(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session: ClientSession | undefined,
    options: { announce: boolean; resumeSeconds?: number },
  ) {
    const counterBefore = draft.counter;
    const nextTeam = this.skipToNextActiveTeam(tournament, draft);
    if (!nextTeam) {
      await this.holdForOwedPicks(tournament, draft, session);
      return;
    }

    const moved = draft.counter !== counterBefore;
    await nextTeam.populate<{
      primaryCoach: CoachDocument;
      coaches: CoachDocument[];
    }>(["primaryCoach", "coaches"]);
    this.setTurnClock(
      draft,
      nextTeam,
      moved ? undefined : options.resumeSeconds,
    );
    queueSideEffect(session, () =>
      this.agendaService.resumeSkipPick(tournament, draft),
    );

    if (draft.status === "IN_PROGRESS") {
      const queued = await this.currentTeamPicks(
        tournament,
        draft,
        nextTeam,
        session,
      );
      if (queued) {
        await draft.save({ session });
        await this.draftPokemon(tournament, draft, nextTeam, queued[0], session);
        return;
      }
    }

    const announce =
      draft.status === "IN_PROGRESS" && (options.announce || moved);
    queueSideEffect(session, async () => {
      this.emitCounter(tournament, draft, nextTeam);
      if (announce) await this.announceTurn(draft, nextTeam);
    });
    await draft.save({ session });
  }

  private async announceTurn(draft: PopulatedDraft, team: PopulatedTeam) {
    if (!draft.channelId) return;
    const mention = await this.discordService.resolveMention(
      draft.channelId,
      team.primaryCoach?.discordName,
    );
    await this.discordService.sendMessage(draft.channelId, {
      content: mention
        ? `${mention}, it is now your turn!`
        : `${team.teamName}, it is now your turn!`,
    });
  }

  private async holdForOwedPicks(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session: ClientSession | undefined,
  ) {
    if (isDraftComplete(tournament, draft)) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    draft.skipTime = undefined;
    draft.remainingTime = undefined;
    await draft.save({ session });

    const owed = owedPicks(tournament, draft);
    queueSideEffect(session, async () => {
      await this.agendaService.cancelSkipPick(draft);
      this.emitCounter(tournament, draft, null);
      if (!draft.channelId || draft.status !== "IN_PROGRESS" || !owed.length)
        return;
      await this.discordService.sendMessage(draft.channelId, {
        content: `Every turn has been taken. Waiting on owed picks from ${owed
          .map(({ team, count }) => `${team.teamName} (${count})`)
          .join(", ")}.`,
      });
    });
  }

  private async completeDraft(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session?: ClientSession,
  ) {
    if (draft.status === "COMPLETED") return;

    draft.status = "COMPLETED";
    queueSideEffect(session, async () => {
      await this.agendaService.cancelSkipPick(draft);
    });
    draft.skipTime = undefined;
    draft.remainingTime = undefined;

    await draft.save({ session });

    queueSideEffect(session, () => {
      this.draftEvents.emitDraftCompleted({
        tournamentSlug: tournament.slug,
        poolSlug: draft.slug,
        audience: draftAudience(draft),
        poolName: draft.name,
      });

      if (draft.channelId) {
        const embed = new EmbedBuilder()
          .setTitle(`${draft.name} Draft Complete`)
          .setURL(this.draftUrl(tournament, draft))
          .setDescription(
            "All teams have finished drafting. Good luck in your matches!",
          )
          .setColor(0x00ff00)
          .setTimestamp();
        this.discordService.sendMessage(draft.channelId, {
          content: `🎉 The draft for ${draft.name} has been completed!`,
          embeds: [embed],
        });
      }
    });
  }

  private sameDeadline(a: Date | undefined, b: Date | undefined) {
    if (!a || !b) return !a && !b;
    return (
      Math.abs(new Date(a).getTime() - new Date(b).getTime()) <=
      SKIP_TIME_TOLERANCE_MS
    );
  }

  async skipCurrentPick(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    expected: ExpectedTurn = { counter: draft.counter },
  ): Promise<SkipOutcome> {
    if (draft.status !== "IN_PROGRESS" || draft.counter !== expected.counter)
      return "stale";

    const team = this.onClockTeam(tournament, draft);
    if (!team) return "stale";

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const fresh = await this.lockDraft(draft, session);
      const onExpectedTurn =
        fresh.status === "IN_PROGRESS" &&
        fresh.counter === expected.counter &&
        (expected.skipTime === undefined ||
          this.sameDeadline(fresh.skipTime, expected.skipTime));
      if (!onExpectedTurn) {
        await session.abortTransaction();
        session.endSession();
        return "stale";
      }

      const fullTeam = await this.teamRepo.findByIdOrNull(team._id);
      const teamName = fullTeam?.teamName || "Unknown Team";

      if (fullTeam) {
        fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
        await fullTeam.save({ session });
        const teamIndex = draft.teams.findIndex((t) =>
          t._id.equals(fullTeam._id),
        );
        if (teamIndex !== -1) draft.teams[teamIndex] = fullTeam;
      }

      draft.eventLog.push({
        eventType: "SKIP",
        details: `${teamName} was skipped`,
        timestamp: new Date(),
      });

      const newTimerLength = fullTeam
        ? calculateTeamTimer(draft.timerLength, fullTeam.skipCount)
        : draft.timerLength;

      queueSideEffect(session, async () => {
        this.draftEvents.emitDraftSkip({
          tournamentSlug: tournament.slug,
          poolSlug: draft.slug,
          audience: draftAudience(draft),
          teamName,
          skipCount: fullTeam?.skipCount || 1,
          newTimerLength,
        });

        if (draft.channelId) {
          const coachMention = await this.discordService.resolveMention(
            draft.channelId,
            fullTeam?.primaryCoach?.discordName,
          );
          await this.discordService.sendMessage(draft.channelId, {
            content: `${teamName} (${coachMention ?? "coach"}) was skipped!`,
          });
        }
      });

      await draft.save({ session });
      await this.advanceSequentialCounter(tournament, draft, session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      clearSideEffects(session);
      session.endSession();
      if (isTransactionConflict(error)) return "busy";
      throw error;
    }

    session.endSession();
    await flushSideEffects(session);
    return "skipped";
  }

  async undraftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    pokemonId: string,
    isOrganizerOverride = false,
  ) {
    if (!isOrganizerOverride && draft.sequentialTurns && !draft.allowRemovals)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "Draft does not allow removals.",
      });

    const currentTeam =
      draft.teams.find((t: PopulatedTeam) => t._id.equals(team._id)) ?? team;

    const pickIndex = currentTeam.pickLog.findIndex(
      (p) => getPokemonIdFromDraft(p) === pokemonId,
    );
    if (pickIndex === -1)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_POKEMON, {
        reason: "Pokemon not found in pick log.",
      });

    const [removed] = currentTeam.pickLog.splice(pickIndex, 1);
    await currentTeam.save();

    const previous = this.pickSummary(tournament, {
      pokemonId,
      addons: removed?.addons,
    });
    const detail = { round: pickIndex, previous };

    this.emitPickUpdated(tournament, draft, currentTeam, detail);
    if (isOrganizerOverride)
      await this.sendDiscordPickUpdate(tournament, draft, currentTeam, detail);
  }

  async setPickAtRound(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    round: number,
    pick: TeamPickEntity,
  ) {
    if (!Number.isInteger(round) || round < 0)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Round must be a non-negative integer.",
      });

    if (round >= tournament.draftCount.max)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Draft only has ${tournament.draftCount.max} rounds.`,
      });

    const currentTeam =
      draft.teams.find((t: PopulatedTeam) => t._id.equals(team._id)) ?? team;

    if (round > currentTeam.pickLog.length)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Cannot set round ${round + 1} before round ${currentTeam.pickLog.length + 1} is filled.`,
      });

    const [replaced] =
      round < currentTeam.pickLog.length
        ? currentTeam.pickLog.splice(round, 1)
        : [];

    const check = await canBeDraftedWithReason(
      tournament,
      draft,
      currentTeam,
      pick,
      { ignoreLimits: true },
    );
    if (!check.canDraft) {
      if (replaced) currentTeam.pickLog.splice(round, 0, replaced);
      throw new PDZError(ErrorCodes.DRAFT.INVALID_POKEMON, {
        reason: check.reason,
      });
    }

    await this.inDraftTransaction(draft, async (session) => {
      currentTeam.pickLog.splice(round, 0, {
        pokemon: { id: toID(pick.pokemonId) },
        picker: replaced?.picker ?? pickerFor(currentTeam),
        addons: pick.addons,
        timestamp: replaced?.timestamp ?? new Date(),
      });

      await currentTeam.save({ session });

      await this.removePokemonFromPicks(
        draft,
        pick.pokemonId,
        session,
        currentTeam._id.toString(),
      );

      const detail = {
        round,
        pokemon: this.pickSummary(tournament, pick),
        previous: replaced
          ? this.pickSummary(tournament, {
              pokemonId: getPokemonIdFromDraft(replaced),
              addons: replaced.addons,
            })
          : undefined,
      };
      queueSideEffect(session, async () => {
        this.emitPickUpdated(tournament, draft, currentTeam, detail);
        await this.sendDiscordPickUpdate(
          tournament,
          draft,
          currentTeam,
          detail,
        );
      });

      if (!replaced)
        await this.handlePostPickState(
          tournament,
          draft,
          currentTeam,
          session,
        );
    });
  }

  private emitCounter(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    currentTeam: PopulatedTeam | null | undefined,
  ) {
    this.draftEvents.emitDraftCounter({
      tournamentSlug: tournament.slug,
      poolSlug: draft.slug,
      audience: draftAudience(draft),
      nextTeam: currentTeam?._id.toString() ?? "",
      ...turnState(tournament, draft),
    });
  }

  async restartClock(tournament: PopulatedTournament, draft: PopulatedDraft) {
    if (draft.status !== "IN_PROGRESS" || draft.noTimer) return;
    const currentTeam = this.onClockTeam(tournament, draft);
    if (!currentTeam) return;

    await this.inDraftTransaction(draft, async (session) => {
      this.setTurnClock(draft, currentTeam);
      await draft.save({ session });
      queueSideEffect(session, async () => {
        await this.agendaService.resumeSkipPick(tournament, draft);
        this.emitCounter(tournament, draft, currentTeam);
      });
    });
  }

  async setCurrentPick(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    round: number,
    position: number,
  ) {
    if (draft.status === "COMPLETED")
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "This draft is complete. Reopen it before moving the turn.",
      });

    const teamCount = draft.teams.length;
    if (!teamCount)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Draft has no teams.",
      });

    if (
      !Number.isInteger(round) ||
      round < 0 ||
      round >= tournament.draftCount.max
    )
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Round must be between 1 and ${tournament.draftCount.max}.`,
      });

    if (!Number.isInteger(position) || position < 0 || position >= teamCount)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Position must be between 1 and ${teamCount}.`,
      });

    await this.inDraftTransaction(draft, async (session) => {
      const previousCounter = draft.counter;
      draft.counter = round * teamCount + position;
      const movedForward = draft.counter > previousCounter;

      const currentTeam = this.onClockTeam(tournament, draft);
      this.setTurnClock(draft, currentTeam);

      await draft.save({ session });

      queueSideEffect(session, async () => {
        await this.agendaService.resumeSkipPick(tournament, draft);
        this.emitCounter(tournament, draft, currentTeam);
        if (draft.channelId && currentTeam)
          await this.announceMovedTurn(
            tournament,
            draft,
            currentTeam,
            { round, position },
            movedForward,
          );
      });
    });
  }

  private async announceMovedTurn(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    currentTeam: PopulatedTeam,
    slot: { round: number; position: number },
    movedForward: boolean,
  ) {
    if (!draft.channelId) return;
    const channelId = draft.channelId;
    await currentTeam.populate<{
      primaryCoach: CoachDocument;
      coaches: CoachDocument[];
    }>(["primaryCoach", "coaches"]);
    const coachMention = await this.discordService.resolveMention(
      channelId,
      currentTeam.primaryCoach?.discordName,
    );
    const embed = new EmbedBuilder()
      .setTitle(
        movedForward
          ? `The draft was skipped ahead to ${currentTeam.teamName}`
          : `The draft is back on ${currentTeam.teamName}`,
      )
      .setColor(0xffde00)
      .setURL(this.draftUrl(tournament, draft))
      .addFields([
        { name: "Round", value: `${slot.round + 1}`, inline: true },
        { name: "Position", value: `${slot.position + 1}`, inline: true },
      ])
      .setTimestamp();
    const verb = movedForward
      ? "skipped the draft ahead"
      : "moved the draft back";
    await this.discordService.sendMessage(channelId, {
      content:
        draft.status === "IN_PROGRESS"
          ? `An organizer ${verb} — ${coachMention ?? "coach"}, it is now your turn!`
          : `An organizer ${verb} to ${coachMention ?? "this coach"}'s turn.`,
      embeds: [embed],
    });
  }

  async batchDraftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    dto: DraftDto,
    isOrganizerOverride = false,
    actor?: string,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const teamIndex = draft.teams.findIndex((t) => t._id.equals(team._id));
      let currentTeam: PopulatedTeam =
        teamIndex !== -1 ? (draft.teams[teamIndex] as PopulatedTeam) : team;

      if (dto.remove?.length) {
        if (draft.sequentialTurns && !draft.allowRemovals)
          throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
            reason: "Draft does not allow removals.",
          });

        for (const pokemonId of dto.remove) {
          const pickIndex = currentTeam.pickLog.findIndex(
            (p) => getPokemonIdFromDraft(p) === pokemonId,
          );
          if (pickIndex === -1)
            throw new PDZError(ErrorCodes.DRAFT.INVALID_POKEMON, {
              reason: `Pokemon ${pokemonId} not found in pick log.`,
            });
          currentTeam.pickLog.splice(pickIndex, 1);
        }
        await currentTeam.save({ session });
        if (teamIndex !== -1) draft.teams[teamIndex] = currentTeam;
      }

      if (dto.add?.length) {
        for (const pick of dto.add) {
          await this.draftPokemon(
            tournament,
            draft,
            currentTeam,
            pick,
            session,
            isOrganizerOverride,
            actor,
          );
          if (teamIndex !== -1)
            currentTeam = draft.teams[teamIndex] as PopulatedTeam;
        }
      }

      await session.commitTransaction();
      await flushSideEffects(session);
    } catch (err) {
      await session.abortTransaction();
      clearSideEffects(session);
      throw err;
    } finally {
      session.endSession();
    }
  }

  async setDraftState(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    state: string,
  ) {
    if (!isDraftStateAction(state)) return;
    if (!this.assertTransition(draft, state)) return;

    const counterBeforeAction = draft.counter;

    await this.inDraftTransaction(draft, async (session) => {
      if (state === "play") await this.play(tournament, draft, session);
      else if (state === "pause") this.pause(draft, session);
      else if (state === "finish")
        await this.finish(tournament, draft, session);
      else this.reopen(draft);

      await draft.save({ session });

      queueSideEffect(session, async () => {
        this.draftEvents.emitDraftStatus({
          tournamentSlug: tournament.slug,
          poolSlug: draft.slug,
          audience: draftAudience(draft),
          status: draft.status,
          noTimer: draft.noTimer,
          currentPick: turnState(tournament, draft).currentPick,
        });

        if (!draft.channelId || state === "finish") return;
        if (state === "reopen") {
          await this.discordService.sendMessage(draft.channelId, {
            content:
              "An organizer reopened the draft. It is paused until they resume it.",
          });
          return;
        }
        const statusLabel =
          draft.status === "IN_PROGRESS"
            ? "started"
            : draft.status === "PAUSED"
              ? "paused"
              : draft.status.toLowerCase();
        const turnText = await this.openingTurnText(
          tournament,
          draft,
          state,
          counterBeforeAction,
        );
        await this.discordService.sendMessage(draft.channelId, {
          content: `The draft is now ${statusLabel}.${turnText}`,
        });
      });
    });
  }

  private async play(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session: ClientSession,
  ) {
    const resumeSeconds = draft.remainingTime;
    draft.status = "IN_PROGRESS";

    if (!draft.sequentialTurns) {
      this.setTurnClock(draft, null);
      queueSideEffect(session, async () => {
        await this.agendaService.cancelSkipPick(draft);
      });
      return;
    }

    await this.openNextTurn(tournament, draft, session, {
      announce: false,
      resumeSeconds,
    });
  }

  private async finish(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session: ClientSession,
  ) {
    const owed = owedPicks(tournament, draft);
    draft.eventLog.push({
      eventType: "FINISH",
      details: owed.length
        ? `An organizer finished the draft with picks still owed by ${owed
            .map(({ team, count }) => `${team.teamName} (${count})`)
            .join(", ")}`
        : "An organizer finished the draft",
      timestamp: new Date(),
    });
    await this.completeDraft(tournament, draft, session);
  }

  private pause(draft: PopulatedDraft, session: ClientSession) {
    draft.status = "PAUSED";
    cancelSkipTime(draft);
    draft.skipTime = undefined;
    queueSideEffect(session, async () => {
      await this.agendaService.cancelSkipPick(draft);
    });
  }

  private reopen(draft: PopulatedDraft) {
    draft.status = "PAUSED";
    draft.skipTime = undefined;
    draft.remainingTime = undefined;
    draft.eventLog.push({
      eventType: "REOPEN",
      details: "An organizer reopened the draft",
      timestamp: new Date(),
    });
  }

  private assertTransition(draft: PopulatedDraft, state: DraftStateAction) {
    const status = draft.status;
    if (state === "play") {
      if (status === "IN_PROGRESS") return false;
      if (status === "COMPLETED")
        throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
          reason: "This draft is complete. Reopen it before resuming.",
        });
      return true;
    }
    if (state === "pause") {
      if (status === "PAUSED") return false;
      if (status !== "IN_PROGRESS")
        throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
          reason: "Only a running draft can be paused.",
        });
      return true;
    }
    if (state === "finish") {
      if (status === "COMPLETED") return false;
      if (status !== "IN_PROGRESS" && status !== "PAUSED")
        throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
          reason: "Only a draft that has started can be finished.",
        });
      return true;
    }
    if (status !== "COMPLETED")
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "Only a completed draft can be reopened.",
      });
    return true;
  }

  private async openingTurnText(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    state: DraftStateAction,
    counterBeforeAction: number,
  ): Promise<string> {
    if (state !== "play") return "";
    if (draft.status !== "IN_PROGRESS") return "";
    if (draft.counter !== counterBeforeAction) return "";

    const currentTeam = this.onClockTeam(tournament, draft);
    if (!currentTeam || !draft.channelId) return "";

    await currentTeam.populate<{ primaryCoach: CoachDocument; coaches: CoachDocument[] }>([
      "primaryCoach",
      "coaches",
    ]);
    const mention = await this.discordService.resolveMention(
      draft.channelId,
      currentTeam.primaryCoach?.discordName,
    );
    return ` ${mention ?? currentTeam.teamName}, it is now your turn!`;
  }

  async updateSettings(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    dto: UpdateDraftSettingsDto,
  ) {
    const changesDraftRules =
      dto.orderProgression !== undefined ||
      dto.sequentialTurns !== undefined ||
      dto.allowDuplicates !== undefined;
    if (changesDraftRules && !isPreDraftStatus(draft.status))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason:
          "Turn order and duplicate settings can only be changed before the draft starts.",
      });

    if (dto.timerLength !== undefined && !isPreDraftStatus(draft.status))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "The pick timer can only be changed before the draft starts.",
      });

    if (dto.name !== undefined) draft.name = dto.name;
    if (dto.channelId === null) draft.channelId = undefined;
    else if (dto.channelId !== undefined) draft.channelId = dto.channelId;
    if (dto.orderProgression !== undefined)
      draft.orderProgression = dto.orderProgression;
    if (dto.sequentialTurns !== undefined)
      draft.sequentialTurns = dto.sequentialTurns;
    if (dto.picksVisibleTo !== undefined)
      draft.picksVisibleTo = dto.picksVisibleTo;
    if (dto.allowDuplicates !== undefined)
      draft.allowDuplicates = dto.allowDuplicates;
    if (dto.allowRemovals !== undefined)
      draft.allowRemovals = dto.allowRemovals;
    if (dto.timerLength !== undefined) draft.timerLength = dto.timerLength;
    if (dto.draftStart !== undefined)
      draft.draftStart = dto.draftStart ? new Date(dto.draftStart) : undefined;
    if (dto.draftEnd !== undefined)
      draft.draftEnd = dto.draftEnd ? new Date(dto.draftEnd) : undefined;

    if (
      draft.draftStart &&
      draft.draftEnd &&
      draft.draftEnd < draft.draftStart
    ) {
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "This pool closes before it opens.",
      });
    }

    await draft.save();
  }

  async cancelScheduledJobs(draft: PopulatedDraft): Promise<void> {
    await this.agendaService.cancelSkipPick(draft);
  }

  async sendTestMessage(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
  ): Promise<boolean> {
    if (!draft.channelId) return false;
    return this.discordService.sendMessage(draft.channelId, {
      content: `This is a test message for **${draft.name}**. If you can see this, the channel ID is configured correctly.`,
    });
  }

  async setDraftOrder(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    dto: SetDraftOrderDto,
  ) {
    if (!isPreDraftStatus(draft.status))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "Team order can only be changed before the draft starts.",
      });

    if (dto.useRandomSeeding) {
      draft.useRandomSeeding = true;
    } else {
      const validIds = new Set(
        draft.teams.map((team) => getDocumentId(team)),
      );
      const submitted = dto.order ?? [];
      const submittedIds = new Set(submitted);

      const isValidPermutation =
        submitted.length === validIds.size &&
        submittedIds.size === submitted.length &&
        [...validIds].every((id) => submittedIds.has(id));

      if (!isValidPermutation)
        throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
          reason: "Order must include every team in the draft exactly once.",
        });

      draft.useRandomSeeding = false;
      draft.teamOrder = submitted.map((id) => new Types.ObjectId(id));
    }

    await draft.save();
  }

  async setNoTimer(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    noTimer: boolean,
  ) {
    await this.inDraftTransaction(draft, async (session) => {
      draft.noTimer = noTimer;

      if (draft.status === "IN_PROGRESS") {
        this.setTurnClock(draft, this.onClockTeam(tournament, draft));
        queueSideEffect(session, () =>
          this.agendaService.resumeSkipPick(tournament, draft),
        );
      }

      await draft.save({ session });

      queueSideEffect(session, () => {
        this.draftEvents.emitDraftStatus({
          tournamentSlug: tournament.slug,
          poolSlug: draft.slug,
          audience: draftAudience(draft),
          status: draft.status,
          noTimer: draft.noTimer,
          currentPick: turnState(tournament, draft).currentPick,
        });
      });
    });
  }
}
