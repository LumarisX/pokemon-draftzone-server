import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachDocument } from "@modules/coach/coach.schema";
import { DiscordService } from "@modules/discord/discord.service";
import { getName, getSpecies } from "@modules/data/domain/pokedex";
import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { TeamPickEntity } from "@modules/team/team.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { AgendaService } from "@modules/agenda/agenda.service";
import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { toID, TypeName } from "@pkmn/data";
import { EmbedBuilder, EmbedField } from "discord.js";
import { ClientSession, Connection } from "mongoose";
import { DraftDto } from "./draft.dto";
import { DraftEventsService } from "./draft-events.service";
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
  ) {}

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

      if (currentDraft.status !== "IN_PROGRESS") {
        throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
          reason: `Draft is currently ${currentDraft.status.toLowerCase().replace("_", " ")}.`,
        });
      }

      if (!(await canTeamDraft(currentDraft, currentTeam))) {
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
          tournamentId: tournament.tournamentKey,
          draftId: currentDraft.draftKey,
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
        name: "Cost",
        value: tier ? tier.cost.toString() : "Banned",
        inline: true,
      },
    ];
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
        .setURL(
          `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/drafts/${draft.draftKey}/draft`,
        )
        .addFields(fields)
        .setImage(
          `https://play.pokemonshowdown.com/sprites/gen5/${pick.pokemonId}.png`,
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

    if (session) {
      queueSideEffect(session, () => this.agendaService.cancelSkipPick(draft));
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

    const newSkipTime = new Date();
    newSkipTime.setSeconds(
      newSkipTime.getSeconds() +
        calculateTeamTimer(draft.timerLength, nextTeam.skipCount || 0),
    );
    draft.skipTime = newSkipTime;

    if (session) {
      queueSideEffect(session, () =>
        this.agendaService.resumeSkipPick(tournament, draft),
      );
    } else {
      await this.agendaService.cancelSkipPick(draft);
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
          tournamentId: tournament.tournamentKey,
          draftId: draft.draftKey,
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
    queueSideEffect(session, () => this.agendaService.cancelSkipPick(draft));
    draft.skipTime = undefined;
    draft.remainingTime = undefined;

    await draft.save({ session });

    queueSideEffect(session, () => {
      this.draftEvents.emitDraftCompleted({
        tournamentId: tournament.tournamentKey,
        draftId: draft.draftKey,
        draftName: draft.name,
      });

      if (draft.channelId) {
        const embed = new EmbedBuilder()
          .setTitle(`${draft.name} Draft Complete`)
          .setURL(
            `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/drafts/${draft.draftKey}/draft`,
          )
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
      tournamentId: tournament.tournamentKey,
      draftId: draft.draftKey,
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
    draft: PopulatedDraft,
    team: PopulatedTeam,
    pokemonId: string,
  ) {
    if (draft.sequentialTurns && !draft.allowRemovals)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_STATE, {
        reason: "Draft does not allow removals.",
      });

    const pickIndex = team.pickLog.findIndex(
      (p) => getPokemonIdFromDraft(p) === pokemonId,
    );
    if (pickIndex === -1)
      throw new PDZError(ErrorCodes.DRAFT.INVALID_POKEMON, {
        reason: "Pokemon not found in pick log.",
      });

    team.pickLog.splice(pickIndex, 1);
    await team.save();
  }

  async batchDraftPokemon(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    dto: DraftDto,
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
        const newSkipTime = new Date();
        const currentTeam = getCurrentPickingTeam(draft);
        const teamTimer = currentTeam
          ? calculateTeamTimer(draft.timerLength, currentTeam.skipCount || 0)
          : (draft.timerLength ?? 30);
        const secondsToAdd = draft.remainingTime ?? teamTimer;
        newSkipTime.setSeconds(newSkipTime.getSeconds() + secondsToAdd);
        draft.skipTime = newSkipTime;
        draft.remainingTime = undefined;

        await draft.save();

        if (!currentTeam) return;

        const queuedPicks = await this.currentTeamPicks(
          tournament,
          draft,
          currentTeam,
        );
        if (queuedPicks?.length) {
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

    await action();
    await draft.save();
    this.draftEvents.emitDraftStatus({
      tournamentId: tournament.tournamentKey,
      draftId: draft.draftKey,
      status: draft.status,
      currentPick: calculateCurrentPick(draft),
    });

    const statusLabel =
      draft.status === "IN_PROGRESS"
        ? "started"
        : draft.status === "PAUSED"
          ? "paused"
          : draft.status.toLowerCase();

    if (draft.channelId) {
      this.discordService.sendMessage(draft.channelId, {
        content: `The draft is now ${statusLabel}.`,
      });
    }
  }
}
