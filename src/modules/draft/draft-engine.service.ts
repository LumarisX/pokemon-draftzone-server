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
import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import { toID, TypeName } from "@pkmn/data";
import { EmbedBuilder, EmbedField } from "discord.js";
import { ClientSession, Connection, Types } from "mongoose";
import {
  DraftDto,
  SetDraftOrderDto,
  UpdateDraftSettingsDto,
} from "./draft.dto";
import { DraftEventsService } from "./draft-events.service";
import type { DraftPickUpdatedEvent } from "./draft-events.service";
import {
  calculateCanDraft,
  calculateCanDraftCounts,
  calculateCurrentPick,
  calculateTeamTimer,
  cancelSkipTime,
  canTeamDraft,
  generatePickOrder,
  getCurrentPickingTeam,
  getCurrentPositionInRound,
  getCurrentRound,
  getDocumentId,
  getDraftOrder,
  getPokemonIdFromDraft,
  isPreDraftStatus,
} from "./domain/pick-order";
import {
  canBeDrafted,
  canBeDraftedWithReason,
  createPokemonTierMap,
  getPickCost,
  isDraftComplete,
  isTeamDoneDrafting,
} from "./domain/tier-cost";

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

/** Used when CLIENT_URL isn't configured, so production keeps working as-is. */
const DEFAULT_CLIENT_URL = "https://pokemondraftzone.com";

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

async function flushSideEffects(session: ClientSession) {
  const effects = sessionSideEffects.get(session) || [];
  sessionSideEffects.delete(session);
  for (const effect of effects) {
    await effect();
  }
}

function clearSideEffects(session: ClientSession) {
  sessionSideEffects.delete(session);
}

@Injectable()
export class DraftEngineService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly teamRepo: TeamRepository,
    private readonly discordService: DiscordService,
    private readonly draftEvents: DraftEventsService,
    @Inject(forwardRef(() => AgendaService))
    private readonly agendaService: AgendaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Link to a draft's live draft board on the client. Mirrors the Angular route
   * `/leagues/:leagueSlug/tournaments/:tournamentSlug/drafts/:draftSlug/draft`.
   */
  private draftUrl(tournament: PopulatedTournament, draft: PopulatedDraft) {
    const baseUrl = (
      this.configService.get<string>("CLIENT_URL") ?? DEFAULT_CLIENT_URL
    ).replace(/\/+$/, "");
    return `${baseUrl}/leagues/${tournament.leagueSlug}/tournaments/${tournament.slug}/drafts/${draft.slug}/draft`;
  }

  /** One roster entry, shaped the way the websocket payloads describe picks. */
  private pickSummary(
    tournament: PopulatedTournament,
    pick: { pokemonId: string; addons?: string[] },
  ) {
    return {
      id: pick.pokemonId,
      name: getName(pick.pokemonId),
      tier: tournament.tierList.pokemon.get(pick.pokemonId)?.tier,
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

  /**
   * Broadcasts an out-of-band roster edit so every open board re-syncs the
   * affected team — nobody else is watching the HTTP response the organizer got.
   */
  private emitPickUpdated(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    detail: Pick<DraftPickUpdatedEvent, "round" | "pokemon" | "previous">,
  ) {
    const pickOrder = generatePickOrder(
      getDraftOrder(draft),
      tournament.draftCount.max,
      draft.orderProgression,
    );

    this.draftEvents.emitDraftPickUpdated({
      tournamentSlug: tournament.slug,
      draftSlug: draft.slug,
      ...detail,
      team: {
        id: team._id.toString(),
        name: team.teamName,
        draft: this.rosterSummary(tournament, team),
      },
      canDraftTeams: calculateCanDraft(draft, pickOrder),
      canDraftCounts: calculateCanDraftCounts(draft, pickOrder),
      currentPick: calculateCurrentPick(draft),
    });
  }

  /**
   * Posts an organizer's roster correction to the draft channel. Coaches watch
   * that feed rather than the board, so a silent edit reads as a lost pick.
   */
  private async sendDiscordPickUpdate(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    detail: Pick<DraftPickUpdatedEvent, "round" | "pokemon" | "previous">,
  ): Promise<void> {
    if (!draft.channelId) return;

    const channelId = draft.channelId;
    const { round, pokemon, previous } = detail;

    await team.populate<{ coach: CoachDocument }>("coach");
    const coachMention = await this.discordService.resolveMention(
      channelId,
      team.coach?.discordName,
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

  async draftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    pick: TeamPickEntity,
    session?: ClientSession,
    isOrganizerOverride = false,
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
        !(await canTeamDraft(currentDraft, currentTeam))
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

      const picker = currentTeam.coach?._id || currentTeam.coach;

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

      currentTeam = (await currentTeam.populate<{ coach: CoachDocument }>(
        "coach",
      )) as unknown as PopulatedTeam;

      const currentTeamId = currentTeam._id.toString();

      const teamIndex = currentDraft.teams.findIndex(
        (t) => getDocumentId(t) === currentTeamId,
      );
      if (teamIndex !== -1) {
        currentDraft.teams[teamIndex] = currentTeam;
      }

      const pickedPokemonData = tournament.tierList.pokemon.get(pick.pokemonId);
      const tier = pickedPokemonData
        ? tournament.tierList.getTierByName(pickedPokemonData.tier)
        : undefined;

      const snipeCount = await this.removePokemonFromPicks(
        currentDraft,
        pick.pokemonId,
        session,
        currentTeamId,
      );

      const initialTeamOrder = getDraftOrder(currentDraft);
      const pickOrder = generatePickOrder(
        initialTeamOrder,
        tournament.draftCount.max,
        currentDraft.orderProgression,
      );
      const canDraftTeams = calculateCanDraft(currentDraft, pickOrder);
      const canDraftCounts = calculateCanDraftCounts(currentDraft, pickOrder);

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
          draftSlug: currentDraft.slug,
          pick: {
            pokemon: {
              id: pick.pokemonId,
              name: getName(pick.pokemonId),
              tier: tier?.name,
              cost: tier?.cost,
            },
            team: { id: currentTeamId, name: currentTeam.teamName },
            draft: currentDraft.name,
          },
          canDraftTeams,
          canDraftCounts,
          team: {
            id: currentTeamId,
            name: currentTeam.teamName,
            draft: draftPicks,
          },
          currentPick: calculateCurrentPick(currentDraft),
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

      if (newSession) {
        await session.commitTransaction();
        await flushSideEffects(session);
      }
    } catch (error) {
      if (newSession) {
        await session.abortTransaction();
        clearSideEffects(session);
      }
      throw error;
    } finally {
      if (newSession) {
        clearSideEffects(session);
        session.endSession();
      }
    }
  }

  private async removePokemonFromPicks(
    draft: PopulatedDraft,
    pokemonId: string,
    session?: ClientSession,
    skipTeamId?: string,
  ) {
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
    if (!draft.channelId) return;

    const channelId = draft.channelId;
    const pokemonName = getName(pick.pokemonId);
    const pokemonSpecie = getSpecies(pick.pokemonId);

    await team.populate<{ coach: CoachDocument }>("coach");

    const coachMention = await this.discordService.resolveMention(
      channelId,
      team.coach?.discordName,
    );
    const messageContent = `${pokemonName} was drafted by ${coachMention ?? "a coach"}.`;

    const color = pokemonSpecie?.types[0]
      ? typeColorMap.get(pokemonSpecie.types[0])
      : undefined;

    const fields: EmbedField[] = [
      { name: "Round", value: `${getCurrentRound(draft) + 1}`, inline: true },
      {
        name: "Position",
        value: `${getCurrentPositionInRound(draft) + 1}`,
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

    if (isDraftComplete(tournament, draft)) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    if (!draft.sequentialTurns) return;

    const currentRound = Math.floor(draft.counter / draft.teams.length);
    const currentPickingTeam = getCurrentPickingTeam(draft);
    if (
      !currentPickingTeam ||
      !currentPickingTeam._id.equals(team._id) ||
      currentPickingTeam.pickLog.length < currentRound + 1
    )
      return;

    await this.advanceSequentialCounter(tournament, draft, session);
  }

  private async skipToNextActiveTeam(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    pickOrder: PopulatedTeam[],
    session?: ClientSession,
  ): Promise<PopulatedTeam | null> {
    let nextTeam = getCurrentPickingTeam(draft);
    if (!nextTeam) return null;

    let skippedTeams = 0;
    const maxSkips = draft.teams.length;

    while (await isTeamDoneDrafting(tournament, draft, nextTeam)) {
      skippedTeams++;
      if (skippedTeams > maxSkips || draft.counter >= pickOrder.length - 1)
        return null;

      const fullTeam = await this.teamRepo.findByIdOrNull(nextTeam._id);
      if (fullTeam) {
        fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
        await fullTeam.save({ session });
        const teamIndex = draft.teams.findIndex((t) =>
          t._id.equals(fullTeam._id),
        );
        if (teamIndex !== -1) draft.teams[teamIndex] = fullTeam;
      }

      draft.counter++;
      nextTeam = getCurrentPickingTeam(draft);
      if (!nextTeam) return null;
    }

    await nextTeam.populate<{ coach: CoachDocument }>("coach");
    return nextTeam;
  }

  private async advanceSequentialCounter(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session?: ClientSession,
  ) {
    const initialTeamOrder = getDraftOrder(draft);
    const pickOrder = generatePickOrder(
      initialTeamOrder,
      tournament.draftCount.max,
      draft.orderProgression,
    );

    if (draft.status !== "IN_PROGRESS") return;

    draft.counter++;

    if (draft.counter >= pickOrder.length) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    const nextTeam = await this.skipToNextActiveTeam(
      tournament,
      draft,
      pickOrder,
      session,
    );
    if (!nextTeam) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    if (draft.noTimer) {
      draft.skipTime = undefined;
    } else {
      const newSkipTime = new Date();
      newSkipTime.setSeconds(
        newSkipTime.getSeconds() +
          calculateTeamTimer(draft.timerLength, nextTeam.skipCount || 0),
      );
      draft.skipTime = newSkipTime;
    }
    // A leftover pause value would otherwise be restored the next time the
    // draft is played, overriding this pick's fresh timer.
    draft.remainingTime = undefined;

    // resumeSkipPick() reconciles the stored jobs against draft.skipTime, so it
    // covers the noTimer case (no skipTime -> jobs deleted) as well.
    if (session) {
      queueSideEffect(session, () =>
        this.agendaService.resumeSkipPick(tournament, draft),
      );
    } else {
      await this.agendaService.resumeSkipPick(tournament, draft);
    }

    const nextTeamPicks = await this.currentTeamPicks(
      tournament,
      draft,
      nextTeam,
      session,
    );
    if (nextTeamPicks) {
      await draft.save({ session });
      await this.draftPokemon(
        tournament,
        draft,
        nextTeam,
        nextTeamPicks[0],
        session,
      );
    } else {
      queueSideEffect(session, async () => {
        this.draftEvents.emitDraftCounter({
          tournamentSlug: tournament.slug,
          draftSlug: draft.slug,
          currentPick: calculateCurrentPick(draft),
          nextTeam: nextTeam._id.toString(),
          canDraftTeams: calculateCanDraft(draft, pickOrder),
          canDraftCounts: calculateCanDraftCounts(draft, pickOrder),
        });

        if (draft.channelId) {
          const channelId = draft.channelId;
          const nextCoachMention = await this.discordService.resolveMention(
            channelId,
            nextTeam.coach.discordName,
          );
          const mentionText = nextCoachMention
            ? `${nextCoachMention}, it is now your turn!`
            : "It is now your turn!";
          await this.discordService.sendMessage(channelId, {
            content: mentionText,
          });
        }
      });

      await draft.save({ session });
    }
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
        draftSlug: draft.slug,
        draftName: draft.name,
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

  async skipCurrentPick(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
  ) {
    if (draft.status !== "IN_PROGRESS") return false;

    const team = getCurrentPickingTeam(draft);

    if (!team) return false;

    const fullTeam = await this.teamRepo.findByIdOrNull(team._id);
    const teamName = fullTeam?.teamName || "Unknown Team";

    if (fullTeam) {
      fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;

      await fullTeam.save();

      const teamIndex = draft.teams.findIndex((t) =>
        t._id.equals(fullTeam._id),
      );
      if (teamIndex !== -1) {
        draft.teams[teamIndex] = fullTeam;
      }
    }

    draft.eventLog.push({
      eventType: "SKIP",
      details: `${teamName} was skipped`,
      timestamp: new Date(),
    });

    await draft.save();

    const newTimerLength = fullTeam
      ? calculateTeamTimer(draft.timerLength, fullTeam.skipCount)
      : draft.timerLength;

    this.draftEvents.emitDraftSkip({
      tournamentSlug: tournament.slug,
      draftSlug: draft.slug,
      teamName,
      skipCount: fullTeam?.skipCount || 1,
      newTimerLength,
    });

    if (draft.channelId) {
      const coachMention = await this.discordService.resolveMention(
        draft.channelId,
        fullTeam?.coach?.discordName,
      );
      const coachLabel = coachMention ?? "coach";
      this.discordService.sendMessage(draft.channelId, {
        content: `${teamName} (${coachLabel}) was skipped!`,
      });
    }

    await this.advanceSequentialCounter(tournament, draft);

    return true;
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

    // The broadcast reads every roster off draft.teams, so mutate that instance
    // rather than the separately-loaded copy the caller handed us.
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
    // pickLog is dense, so the removed entry's index was its round.
    const detail = { round: pickIndex, previous };

    this.emitPickUpdated(tournament, draft, currentTeam, detail);
    if (isOrganizerOverride)
      await this.sendDiscordPickUpdate(tournament, draft, currentTeam, detail);
  }

  /**
   * Organizer-only correction of a single turn: writes `pick` into the team's
   * round-`round` slot instead of appending like a normal draft pick would.
   * Replacing an earlier round is the whole point (a coach's round-2 pick was
   * wrong), so this deliberately bypasses turn order.
   *
   * Filling the empty slot that is *on the clock* is the exception: that is the
   * turn being taken, so it advances the counter and timer exactly as a coach's
   * own pick would. Every other edit leaves the counter where it is.
   */
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

    // canBeDraftedWithReason reads every roster off draft.teams, so mutate that
    // instance rather than the separately-loaded copy the caller handed us —
    // otherwise the slot we clear below is still "taken" during validation.
    const currentTeam =
      draft.teams.find((t: PopulatedTeam) => t._id.equals(team._id)) ?? team;

    // pickLog is dense (index === round), so a slot past the end would leave a
    // hole. Organizers fill rounds in order or replace an existing one.
    if (round > currentTeam.pickLog.length)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: `Cannot set round ${round + 1} before round ${currentTeam.pickLog.length + 1} is filled.`,
      });

    // Validate against the roster *without* the pick being replaced, so the slot
    // being swapped doesn't count itself as already drafted.
    const [replaced] =
      round < currentTeam.pickLog.length
        ? currentTeam.pickLog.splice(round, 1)
        : [];

    // An organizer setting a pick here is overriding the draft rules on purpose
    // — going over the point total or stranding a tier requirement is their
    // call to make, so only the coherence checks are enforced.
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

    // Whether this edit is the turn on the clock has to be read *before* the
    // slot is written, since filling it is what satisfies the check.
    const fillsCurrentTurn =
      !replaced &&
      draft.sequentialTurns &&
      round === getCurrentRound(draft) &&
      !!getCurrentPickingTeam(draft)?._id.equals(currentTeam._id);

    currentTeam.pickLog.splice(round, 0, {
      pokemon: { id: toID(pick.pokemonId) },
      picker: replaced?.picker ?? (currentTeam.coach?._id || currentTeam.coach),
      addons: pick.addons,
      timestamp: replaced?.timestamp ?? new Date(),
    });

    await currentTeam.save();

    // A corrected pick can take a Pokemon out from under another team that had
    // it queued — drop it from their queues the same way a live pick would.
    await this.removePokemonFromPicks(
      draft,
      pick.pokemonId,
      undefined,
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
    this.emitPickUpdated(tournament, draft, currentTeam, detail);
    await this.sendDiscordPickUpdate(tournament, draft, currentTeam, detail);

    if (fillsCurrentTurn)
      await this.handlePostPickState(tournament, draft, currentTeam);
  }

  /**
   * Organizer rewind: points the draft at an explicit round and position and
   * hands that team a fresh clock. Undoes an accidental skip, or re-opens a turn
   * whose pick the organizer just cleared.
   */
  async setCurrentPick(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    round: number,
    position: number,
  ) {
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

    draft.counter = round * teamCount + position;

    const currentTeam = getCurrentPickingTeam(draft);
    const teamTimer = currentTeam
      ? calculateTeamTimer(draft.timerLength, currentTeam.skipCount || 0)
      : (draft.timerLength ?? 30);

    if (draft.noTimer) {
      draft.skipTime = undefined;
      draft.remainingTime = undefined;
    } else if (draft.status === "IN_PROGRESS") {
      const newSkipTime = new Date();
      newSkipTime.setSeconds(newSkipTime.getSeconds() + teamTimer);
      draft.skipTime = newSkipTime;
      draft.remainingTime = undefined;
    } else {
      // Bank a full turn instead of whatever was left on the turn we jumped
      // away from, so play hands this team a clean clock.
      draft.skipTime = undefined;
      draft.remainingTime = teamTimer;
    }

    await draft.save();
    await this.agendaService.resumeSkipPick(tournament, draft);

    const pickOrder = generatePickOrder(
      getDraftOrder(draft),
      tournament.draftCount.max,
      draft.orderProgression,
    );
    this.draftEvents.emitDraftCounter({
      tournamentSlug: tournament.slug,
      draftSlug: draft.slug,
      currentPick: calculateCurrentPick(draft),
      nextTeam: currentTeam?._id.toString() ?? "",
      canDraftTeams: calculateCanDraft(draft, pickOrder),
      canDraftCounts: calculateCanDraftCounts(draft, pickOrder),
    });

    if (draft.channelId && currentTeam) {
      const channelId = draft.channelId;
      await currentTeam.populate<{ coach: CoachDocument }>("coach");
      const coachMention = await this.discordService.resolveMention(
        channelId,
        currentTeam.coach?.discordName,
      );
      const embed = new EmbedBuilder()
        .setTitle(`The draft is back on ${currentTeam.teamName}`)
        .setColor(0xffde00)
        .setURL(this.draftUrl(tournament, draft))
        .addFields([
          { name: "Round", value: `${round + 1}`, inline: true },
          { name: "Position", value: `${position + 1}`, inline: true },
        ])
        .setTimestamp();
      await this.discordService.sendMessage(channelId, {
        content:
          draft.status === "IN_PROGRESS"
            ? `An organizer moved the draft back — ${coachMention ?? "coach"}, it is now your turn!`
            : `An organizer moved the draft back to ${coachMention ?? "this coach"}'s turn.`,
        embeds: [embed],
      });
    }
  }

  async batchDraftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    dto: DraftDto,
    isOrganizerOverride = false,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const teamIndex = draft.teams.findIndex((t) => t._id.equals(team._id));
      let currentTeam: PopulatedTeam =
        teamIndex !== -1 ? (draft.teams[teamIndex] as PopulatedTeam) : team;

      // Removes first — frees points before adds are validated
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

      // Adds — each call validates, mutates draft.teams in-memory, and queues WS events
      if (dto.add?.length) {
        for (const pick of dto.add) {
          await this.draftPokemon(
            tournament,
            draft,
            currentTeam,
            pick,
            session,
            isOrganizerOverride,
          );
          // draftPokemon() updates draft.teams[teamIndex] in-memory; refresh reference
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
    const statusActions: Record<"play" | "pause", () => Promise<void>> = {
      play: async () => {
        draft.status = "IN_PROGRESS";
        const currentTeam = getCurrentPickingTeam(draft);

        if (draft.noTimer) {
          draft.skipTime = undefined;
          draft.remainingTime = undefined;
        } else {
          // Restore whatever the pause banked; fall back to a full turn when
          // the draft was never paused (or was paused with the timer off).
          const teamTimer = currentTeam
            ? calculateTeamTimer(draft.timerLength, currentTeam.skipCount || 0)
            : (draft.timerLength ?? 30);
          const secondsToAdd = draft.remainingTime ?? teamTimer;
          const newSkipTime = new Date();
          newSkipTime.setSeconds(newSkipTime.getSeconds() + secondsToAdd);
          draft.skipTime = newSkipTime;
          draft.remainingTime = undefined;
        }

        await draft.save();

        const queuedPicks = currentTeam
          ? await this.currentTeamPicks(tournament, draft, currentTeam)
          : null;
        if (currentTeam && queuedPicks?.length) {
          // draftPokemon() advances the draft, which reschedules the timer
          // itself.
          await this.draftPokemon(
            tournament,
            draft,
            currentTeam,
            queuedPicks[0],
          );
          return;
        }

        await this.agendaService.resumeSkipPick(tournament, draft);
      },
      pause: async () => {
        draft.status = "PAUSED";
        // Bank the time left before clearing the deadline, so play can hand the
        // coach back exactly what they had.
        cancelSkipTime(draft);
        draft.skipTime = undefined;
        await this.agendaService.cancelSkipPick(draft);
      },
    };

    if (state !== "play" && state !== "pause") {
      return;
    }

    const action = statusActions[state];
    if (typeof action !== "function") {
      return;
    }

    // Play can auto-draft a queued pick, which advances the counter and pings
    // the next coach itself — compare against this so that team isn't pinged
    // twice below.
    const counterBeforeAction = draft.counter;

    await action();
    await draft.save();
    this.draftEvents.emitDraftStatus({
      tournamentSlug: tournament.slug,
      draftSlug: draft.slug,
      status: draft.status,
      noTimer: draft.noTimer,
      currentPick: calculateCurrentPick(draft),
    });

    const statusLabel =
      draft.status === "IN_PROGRESS"
        ? "started"
        : draft.status === "PAUSED"
          ? "paused"
          : draft.status.toLowerCase();

    if (draft.channelId) {
      // Starting (or resuming) leaves a coach on the clock with nothing
      // announcing it — advanceSequentialCounter only pings once a pick lands,
      // so without this the first coach of the draft is never told it's on them.
      const turnText = await this.openingTurnText(
        draft,
        state,
        counterBeforeAction,
      );
      await this.discordService.sendMessage(draft.channelId, {
        content: `The draft is now ${statusLabel}.${turnText}`,
      });
    }
  }

  /**
   * Trailing "it is now your turn" for the play/pause announcement, empty when
   * nobody is newly on the clock (paused, non-sequential free-for-all, or a
   * queued pick already advanced the draft and pinged the next coach).
   */
  private async openingTurnText(
    draft: PopulatedDraft,
    state: "play" | "pause",
    counterBeforeAction: number,
  ): Promise<string> {
    if (state !== "play") return "";
    if (draft.status !== "IN_PROGRESS") return "";
    if (!draft.sequentialTurns) return "";
    if (draft.counter !== counterBeforeAction) return "";

    const currentTeam = getCurrentPickingTeam(draft);
    if (!currentTeam || !draft.channelId) return "";

    await currentTeam.populate<{ coach: CoachDocument }>("coach");
    const mention = await this.discordService.resolveMention(
      draft.channelId,
      currentTeam.coach?.discordName,
    );
    return ` ${mention ?? currentTeam.teamName}, it is now your turn!`;
  }

  /**
   * Organizer-only: update draft metadata/settings. `orderProgression` and
   * `sequentialTurns` feed directly into pick-order calculation the same way
   * team order does, so — like setDraftOrder — those two are only allowed
   * pre-draft; `name`, `channelId`, `visibility`, and `allowRemovals` don't
   * affect turn order and can be changed anytime.
   */
  async updateSettings(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    dto: UpdateDraftSettingsDto,
  ) {
    const changesTurnOrder =
      dto.orderProgression !== undefined || dto.sequentialTurns !== undefined;
    if (changesTurnOrder && !isPreDraftStatus(draft.status))
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason:
          "Turn order settings can only be changed before the draft starts.",
      });

    if (dto.name !== undefined) draft.name = dto.name;
    if (dto.channelId === null) draft.channelId = undefined;
    else if (dto.channelId !== undefined) draft.channelId = dto.channelId;
    if (dto.orderProgression !== undefined)
      draft.orderProgression = dto.orderProgression;
    if (dto.sequentialTurns !== undefined)
      draft.sequentialTurns = dto.sequentialTurns;
    if (dto.visibility !== undefined) draft.visibility = dto.visibility;
    if (dto.allowRemovals !== undefined)
      draft.allowRemovals = dto.allowRemovals;

    await draft.save();
  }

  /** Organizer-only: verifies the saved channelId actually works, without waiting on a real draft event. */
  async sendTestMessage(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
  ): Promise<boolean> {
    if (!draft.channelId) return false;
    return this.discordService.sendMessage(draft.channelId, {
      content: `This is a test message for **${draft.name}**. If you can see this, the channel ID is configured correctly.`,
    });
  }

  /**
   * Organizer-only: switch between random and manual seeding, and/or write a
   * manual order. Only allowed pre-draft — once picks exist, `draft.counter`
   * and every logged pick are tied to the order teams drafted in, so changing
   * it afterward would desync whose turn it is.
   */
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
    draft.noTimer = noTimer;

    if (draft.status === "IN_PROGRESS") {
      if (noTimer) {
        draft.skipTime = undefined;
        draft.remainingTime = undefined;
      } else {
        const currentTeam = getCurrentPickingTeam(draft);
        const teamTimer = currentTeam
          ? calculateTeamTimer(draft.timerLength, currentTeam.skipCount || 0)
          : (draft.timerLength ?? 30);
        const newSkipTime = new Date();
        newSkipTime.setSeconds(newSkipTime.getSeconds() + teamTimer);
        draft.skipTime = newSkipTime;
        draft.remainingTime = undefined;
      }
      await this.agendaService.resumeSkipPick(tournament, draft);
    }

    await draft.save();

    this.draftEvents.emitDraftStatus({
      tournamentSlug: tournament.slug,
      draftSlug: draft.slug,
      status: draft.status,
      noTimer: draft.noTimer,
      currentPick: calculateCurrentPick(draft),
    });
  }
}
