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
import { toID, TypeName } from "@pkmn/data";
import { EmbedBuilder, EmbedField } from "discord.js";
import mongoose, { ClientSession } from "mongoose";
import { DraftEventsService } from "./draft-events.service";
import {
  calculateCanDraft,
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

/**
 * The stateful draft "engine": the mutating, transactional, side-effecting
 * (Discord notifications, websocket events, Agenda skip timers) operations
 * that move a draft forward. Pure read/computation logic lives in ./domain
 * instead, importable without Nest DI (the legacy /leagues route relies on
 * that).
 *
 * Needs Nest DI (TeamRepository) to re-fetch a team mid-flow without the
 * raw-Mongoose-model workaround the free-function predecessor of this class
 * used. AgendaModule and DraftModule depend on each other (this service
 * calls into AgendaService for skip timers; AgendaService's skip-draft-pick
 * job handler calls back into this service) — forwardRef() on both sides
 * resolves that cycle. The one remaining non-Nest caller
 * (routes/league.route.ts) reaches this through the nest-app-context bridge
 * instead of constructor injection.
 *
 * Discord notifications go through the Nest DiscordService, and draft
 * lifecycle events go through DraftEventsService, an anti-corruption layer
 * around the EventEmitter2 bus that a future websocket gateway will
 * subscribe to.
 */
@Injectable()
export class DraftEngineService {
  constructor(
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
      session = await mongoose.startSession();
      session.startTransaction();
      newSession = true;
    }

    let currentDraft = draft;
    let currentTeam = team;

    try {
      if (draft.status === "IN_PROGRESS") {
        currentDraft.status = "IN_PROGRESS";
      }

      const dbTeam = currentDraft.teams.find((t: PopulatedTeam) =>
        t._id.equals(team._id),
      );
      if (!dbTeam) {
        throw new Error("Team not found in draft.");
      }
      currentTeam = dbTeam;

      if (!(await canTeamDraft(currentDraft, currentTeam))) {
        throw new Error("It is not this team's turn to draft.");
      }

      const draftCheck = await canBeDraftedWithReason(
        tournament,
        currentDraft,
        currentTeam,
        pick,
      );
      if (!draftCheck.canDraft)
        throw new Error(draftCheck.reason || "Pokemon cannot be drafted.");

      const picker = currentTeam.coach?._id || currentTeam.coach;

      currentTeam.pickLog.push({
        pokemon: {
          id: toID(pick.pokemonId),
        },
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

      const coach = currentTeam.coach;
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

      const numberOfRounds = tournament.draftCount.max;
      const initialTeamOrder = getDraftOrder(currentDraft);

      const pickOrder = generatePickOrder(
        initialTeamOrder,
        numberOfRounds,
        currentDraft.orderProgression,
      );
      const canDraftTeams = calculateCanDraft(currentDraft, pickOrder);
      const pokemonSpecie = getSpecies(pick.pokemonId)!;

      const pokemonTierMap = createPokemonTierMap(tournament);

      const draftPicks = await Promise.all(
        currentTeam.pickLog.map(async (pick) => ({
          id: getPokemonIdFromDraft(pick),
          name: getName(getPokemonIdFromDraft(pick)),
          tier: pokemonTierMap.get(getPokemonIdFromDraft(pick)),
          cost: getPickCost(tournament.tierList, {
            pokemonId: getPokemonIdFromDraft(pick),
            addons: pick.addons,
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
              name: pokemonSpecie.name,
              tier: tier?.name,
              cost: tier?.cost,
            },
            team: {
              id: currentTeamId,
              name: currentTeam.teamName,
            },
            draft: currentDraft.name,
          },
          canDraftTeams,
          team: {
            id: currentTeamId,
            name: currentTeam.teamName,
            draft: draftPicks,
          },
          currentPick: calculateCurrentPick(currentDraft),
        });
      });

      if (currentDraft.channelId) {
        const channelId = currentDraft.channelId;
        const pokemon = {
          name: pokemonSpecie.name,
          id: pick.pokemonId,
        };

        await currentTeam.populate<{
          coach: CoachDocument;
        }>("coach");

        const coachMention = await this.discordService.resolveMention(
          channelId,
          currentTeam.coach?.discordName,
        );
        const messageContent = `${pokemon.name} was drafted by ${
          coachMention ?? "a coach"
        }.`;

        const currentRound = getCurrentRound(currentDraft);
        const currentPositionInRound = getCurrentPositionInRound(currentDraft);

        const color = typeColorMap.get(pokemonSpecie.types[0]);

        const fields: EmbedField[] = [
          {
            name: "Round",
            value: `${currentRound + 1}`,
            inline: true,
          },
          {
            name: "Position",
            value: `${currentPositionInRound + 1}`,
            inline: true,
          },
          {
            name: "Cost",
            value: tier ? tier.cost.toString() : "Banned",
            inline: true,
          },
        ];
        if (pick.addons?.length)
          fields.push({
            name: "Captain",
            value: "Tera",
            inline: true,
          });
        if (snipeCount)
          fields.push({
            name: "Sniped Teams",
            value: snipeCount.toString(),
            inline: true,
          });
        queueSideEffect(session, () => {
          const embed = new EmbedBuilder()
            .setTitle(`${currentTeam.teamName} drafted ${pokemon.name}!`)
            .setColor(color ?? 0xffde00)
            // Best-guess server-side rename; the Angular client's
            // /divisions/ route isn't updated this pass (see plan Section 0).
            .setURL(
              `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/drafts/${currentDraft.draftKey}/draft`,
            )
            .addFields(fields)
            .setImage(
              `https://play.pokemonshowdown.com/sprites/gen5/${pokemon.id}.png`,
            )
            .setTimestamp();
          this.discordService.sendMessage(channelId, {
            content: messageContent,
            embeds: [embed],
          });
        });
      }

      await this.checkCounterIncrease(tournament, currentDraft, currentTeam, session);

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

  private async increaseCounter(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session?: ClientSession,
  ) {
    try {
      const numberOfRounds = tournament.draftCount.max;
      const initialTeamOrder = getDraftOrder(draft);
      const pickOrder = generatePickOrder(
        initialTeamOrder,
        numberOfRounds,
        draft.orderProgression,
      );

      if (draft.status !== "IN_PROGRESS") return;

      if (isDraftComplete(tournament, draft)) {
        await this.completeDraft(tournament, draft, session);
        return;
      }

      draft.counter++;

      if (draft.counter >= pickOrder.length) {
        await this.completeDraft(tournament, draft, session);
        return;
      }

      if (session) {
        queueSideEffect(session, () => this.agendaService.cancelSkipPick(draft as any));
      }
      let nextTeam = getCurrentPickingTeam(draft);

      if (!nextTeam) {
        await this.completeDraft(tournament, draft, session);
        return;
      }

      let skippedTeams = 0;
      const maxSkips = initialTeamOrder.length;

      while (await isTeamDoneDrafting(tournament, draft, nextTeam)) {
        skippedTeams++;

        if (skippedTeams > maxSkips || draft.counter >= pickOrder.length - 1) {
          await this.completeDraft(tournament, draft, session);
          return;
        }

        const fullTeam = await this.teamRepo.findByIdOrNull(nextTeam._id);
        if (fullTeam) {
          fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
          await fullTeam.save({ session });
          const teamIndex = draft.teams.findIndex((t) =>
            t._id.equals(fullTeam._id),
          );
          if (teamIndex !== -1) {
            draft.teams[teamIndex] = fullTeam;
          }
        }
        draft.counter++;
        const newNextTeam = getCurrentPickingTeam(draft);
        if (!newNextTeam) {
          await this.completeDraft(tournament, draft, session);
          return;
        }
        nextTeam = newNextTeam;
      }

      if (session) {
        const newSkipTime = new Date();
        const teamTimer = calculateTeamTimer(
          draft.timerLength,
          nextTeam.skipCount || 0,
        );
        newSkipTime.setSeconds(newSkipTime.getSeconds() + teamTimer);
        draft.skipTime = newSkipTime;
        queueSideEffect(session, () =>
          this.agendaService.resumeSkipPick(tournament, draft as any),
        );
      } else {
        const newSkipTime = new Date();
        const teamTimer = calculateTeamTimer(
          draft.timerLength,
          nextTeam.skipCount || 0,
        );
        newSkipTime.setSeconds(newSkipTime.getSeconds() + teamTimer);
        draft.skipTime = newSkipTime;
        await this.agendaService.cancelSkipPick(draft as any);
        await this.agendaService.resumeSkipPick(tournament, draft as any);
      }

      await nextTeam.populate<{
        coach: CoachDocument;
      }>("coach");

      const nextTeamPicks = await this.currentTeamPicks(
        tournament,
        draft,
        nextTeam,
        session,
      );
      if (nextTeamPicks) {
        await draft.save({ session });
        await this.draftPokemon(tournament, draft, nextTeam, nextTeamPicks[0], session);
      } else {
        queueSideEffect(session, async () => {
          this.draftEvents.emitDraftCounter({
            tournamentId: tournament.tournamentKey,
            draftId: draft.draftKey,
            currentPick: calculateCurrentPick(draft),
            nextTeam: nextTeam._id.toString(),
            canDraftTeams: calculateCanDraft(draft, pickOrder),
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
    } catch (error) {
      console.error("Error in increaseCounter:", error);
      throw error;
    }
  }

  private async completeDraft(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    session?: ClientSession,
  ) {
    if (draft.status === "COMPLETED") return;

    draft.status = "COMPLETED";
    queueSideEffect(session, () => this.agendaService.cancelSkipPick(draft as any));
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
          // Best-guess server-side rename; the Angular client's
          // /divisions/ route isn't updated this pass (see plan Section 0).
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

  private async checkCounterIncrease(
    tournament: PopulatedTournament,
    draft: PopulatedDraft,
    team: PopulatedTeam,
    session?: ClientSession,
  ) {
    const currentRound = Math.floor(draft.counter / draft.teams.length);
    const currentPickingTeam = getCurrentPickingTeam(draft);
    if (!currentPickingTeam) {
      await this.completeDraft(tournament, draft, session);
      return;
    }

    if (
      currentPickingTeam._id.equals(team._id) &&
      currentPickingTeam.pickLog.length >= currentRound + 1
    ) {
      await this.increaseCounter(tournament, draft, session);
    }
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

      const teamIndex = draft.teams.findIndex((t) => t._id.equals(fullTeam._id));
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

    await this.increaseCounter(tournament, draft);

    return true;
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
          : draft.timerLength ?? 30;
        const secondsToAdd = draft.remainingTime ?? teamTimer;
        newSkipTime.setSeconds(newSkipTime.getSeconds() + secondsToAdd);
        draft.skipTime = newSkipTime;
        draft.remainingTime = undefined;

        await draft.save();

        if (!currentTeam) {
          return;
        }

        const queuedPicks = await this.currentTeamPicks(tournament, draft, currentTeam);
        if (queuedPicks?.length) {
          await this.draftPokemon(tournament, draft, currentTeam, queuedPicks[0]);
          return;
        }

        await this.agendaService.resumeSkipPick(tournament, draft as any);
      },
      pause: async () => {
        draft.status = "PAUSED";
        cancelSkipTime(draft);
        draft.skipTime = undefined;
        await this.agendaService.cancelSkipPick(draft as any);
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
