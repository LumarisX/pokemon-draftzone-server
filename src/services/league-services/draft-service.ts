import { toID, TypeName } from "@pkmn/data";
import { EmbedField } from "discord.js";
import mongoose, { ClientSession } from "mongoose";
import { cancelSkipPick, resumeSkipPick } from "../../agenda";
import { resolveDiscordMention, sendDiscordMessage } from "../../discord";
import eventEmitter from "../../event-emitter";
import { CoachDocument } from "@modules/coach/coach.schema";
import { TeamPick } from "../../models/league/team.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { PopulatedDraft } from "@modules/draft/draft.repository";
import {
  PickLogEntity,
  TeamDocument,
  TeamEntity,
  TeamSchema,
} from "@modules/team/team.schema";
import { PopulatedTeam } from "@modules/team/team.repository";
import { getName, getSpecies } from "../data-services/pokedex.service";
import { getPokemonTier } from "./tier-list-service";

// Plain Mongoose model lookup (not Nest-DI) — this file is a free-function
// service module like agenda.ts, not a Nest-managed class, so it can't take
// TeamRepository via constructor injection. Resolves against whatever model
// Nest already registered for TeamEntity on the default connection; falls
// back to registering it directly if this module loads before Nest does.
const TeamMongooseModel: mongoose.Model<TeamDocument> =
  (mongoose.models[TeamEntity.name] as mongoose.Model<TeamDocument>) ??
  (mongoose.model(TeamEntity.name, TeamSchema) as unknown as mongoose.Model<TeamDocument>);

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
 * Extracts the Pokemon ID from a draft pick.
 */
export function getPokemonIdFromDraft(pick: PickLogEntity): string {
  return pick.pokemon.id;
}

function getDocumentId(
  value: mongoose.Types.ObjectId | { _id: mongoose.Types.ObjectId },
): string {
  return value instanceof mongoose.Types.ObjectId
    ? value.toString()
    : value._id.toString();
}

export type DraftPick = {
  teamName: string;
  pokemon?: { id: string; name: string };
};

export type DraftRound = DraftPick[];

export type TeamWithCoachStatus = {
  id: string;
  name: string;
  draft: { id: string; name: string; tier: string | undefined }[];
  logo?: string;
  isCoach: boolean;
  picks: { id: string; name: string; tier: string | undefined }[][];
  timezone?: string;
  skipCount: number;
};

/**
 * Creates a map of pokemonId to tier for faster lookups
 * @param tournament - The tournament document with a populated tierList
 * @returns A map where keys are pokemonIds and values are tier names
 */
function createPokemonTierMap(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = tournament.tierList;
  Array.from(tierList.pokemon.entries()).forEach(([pokemonId, data]) => {
    tierMap.set(pokemonId, data.tier);
  });
  return tierMap;
}

function getBaseTierCost(
  tierList: LeagueTierListDocument,
  pokemonId: string,
): number {
  const pokemonData = tierList.pokemon.get(pokemonId);
  if (!pokemonData) {
    return 0;
  }
  return (
    tierList.tiers.find((tier) => tier.name === pokemonData.tier)?.cost || 0
  );
}

function getAddonCost(
  tierList: LeagueTierListDocument,
  pokemonId: string,
  selectedAddons?: string[],
): number {
  if (!selectedAddons?.length) {
    return 0;
  }

  const pokemonData = tierList.pokemon.get(pokemonId);
  const addons = pokemonData?.addons;
  if (!addons?.length) {
    return 0;
  }

  const selectedAddonSet = new Set(selectedAddons);
  return addons
    .filter((addon) => selectedAddonSet.has(addon.name))
    .reduce((total, addon) => total + addon.cost, 0);
}

function getPickCost(
  tierList: LeagueTierListDocument,
  pick: { pokemonId: string; addons?: string[] },
): number {
  if (pick.addons?.length) {
    return getAddonCost(tierList, pick.pokemonId, pick.addons);
  }

  return getBaseTierCost(tierList, pick.pokemonId);
}

function areAddonsValid(
  tierList: LeagueTierListDocument,
  pick: TeamPick,
): boolean {
  if (!pick.addons?.length) {
    return true;
  }

  const pokemonData = tierList.pokemon.get(pick.pokemonId);
  if (!pokemonData?.addons?.length) {
    return false;
  }

  const validAddonNames = new Set(
    pokemonData.addons.map((addon) => addon.name),
  );
  const selectedAddonSet = new Set(pick.addons);

  if (selectedAddonSet.size !== pick.addons.length) {
    return false;
  }

  return pick.addons.every((addonName) => validAddonNames.has(addonName));
}

export function getDraftOrder(draft: PopulatedDraft): PopulatedTeam[] {
  if (draft.teams.length <= 1 || !draft.useRandomSeeding) return draft.teams;

  let seed = 0;
  const draftId = draft._id.toString();
  for (let i = 0; i < draftId.length; i++) {
    seed = (seed << 5) - seed + draftId.charCodeAt(i);
    seed = seed & seed;
  }
  const seededRandom = (index: number) => {
    const x = Math.sin((seed + index) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const shuffled = [...draft.teams];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Generates the full pick order for a draft.
 * @param initialTeamOrder - The initial order of teams.
 * @param numberOfRounds - The total number of rounds in the draft.
 * @param orderProgression - The style of the draft ('snake' or 'linear').
 * @returns An array of PopulatedTeam representing the pick order.
 */
export function generatePickOrder(
  initialTeamOrder: PopulatedTeam[],
  numberOfRounds: number,
  orderProgression: "snake" | "linear",
): PopulatedTeam[] {
  const pickOrder: PopulatedTeam[] = [];
  for (let r = 0; r < numberOfRounds; r++) {
    let currentRoundOrder = [...initialTeamOrder];
    if (orderProgression === "snake" && r % 2 === 1) {
      currentRoundOrder.reverse();
    }
    pickOrder.push(...currentRoundOrder);
  }
  return pickOrder;
}

/**
 * Builds the draft board, both as a flat list and structured into rounds.
 * @param draft - The draft document.
 * @param pickOrder - The generated pick order.
 * @returns An object containing the flat draft board and the draft rounds.
 */
export async function buildDraftBoards(
  draft: PopulatedDraft,
  pickOrder: PopulatedTeam[],
): Promise<{ flatDraftBoard: DraftPick[]; draftRounds: DraftRound[] }> {
  const initialTeamOrder = getDraftOrder(draft);
  const teamDraftCursors = new Map<string, number>();
  initialTeamOrder.forEach((t) => teamDraftCursors.set(t._id.toString(), 0));

  const flatDraftBoard: DraftPick[] = [];
  for (let i = 0; i < pickOrder.length; i++) {
    const team = pickOrder[i];
    const draftPick: DraftPick = {
      teamName: team.teamName,
    };

    const teamId = team._id.toString();
    const cursor = teamDraftCursors.get(teamId)!;
    if (team.pickLog[cursor]) {
      const pokemonId = getPokemonIdFromDraft(team.pickLog[cursor]);
      draftPick.pokemon = {
        id: pokemonId,
        name: getName(pokemonId),
      };
      teamDraftCursors.set(teamId, cursor + 1);
    }

    flatDraftBoard.push(draftPick);
  }

  const draftRounds: DraftRound[] = [];
  const teamsCount = initialTeamOrder.length;
  const numberOfRounds = pickOrder.length / teamsCount;
  for (let i = 0; i < numberOfRounds; i++) {
    draftRounds.push(
      flatDraftBoard.slice(i * teamsCount, (i + 1) * teamsCount),
    );
  }

  return { flatDraftBoard, draftRounds };
}

/**
 * Gathers and processes team information, including coach status and picks.
 * @param draft - The draft document with composed teams and coach.
 * @param tournament - The league document.
 * @param userId - The auth0Id of the user making the request.
 * @param numberOfRounds - The total number of draft rounds.
 * @returns A promise that resolves to an array of team data.
 */
export async function getTeamsWithCoachStatus(
  draft: PopulatedDraft,
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  userId: string,
  numberOfRounds: number,
): Promise<TeamWithCoachStatus[]> {
  const pokemonTierMap = createPokemonTierMap(tournament);

  const teams = await Promise.all(
    draft.teams.map(async (team: PopulatedTeam) => {
      const isCoach = team.coach.auth0Id === userId;
      const maxPicks = numberOfRounds - team.pickLog.length;
      let picks: any[] = [];
      const tierList = tournament.tierList;
      if (isCoach) {
        const processedPicks = await Promise.all(
          team.picks.slice(0, maxPicks).map(async (round) =>
            Promise.all(
              round.map(async (pick) => {
                const cost = getPickCost(tierList, {
                  pokemonId: pick.pokemonId,
                  addons: pick.addons,
                });
                return {
                  id: pick.pokemonId,
                  name: getName(pick.pokemonId),
                  tier: pokemonTierMap.get(pick.pokemonId),
                  cost,
                  addons: pick.addons,
                };
              }),
            ),
          ),
        );
        picks = processedPicks;
        while (picks.length < maxPicks) {
          picks.push([]);
        }
      }
      const draftPicks = await Promise.all(
        team.pickLog.map(async (pick) => {
          const cost = getPickCost(tierList, {
            pokemonId: pick.pokemon.id,
            addons: pick.addons,
          });
          const pokemonId = getPokemonIdFromDraft(pick);
          return {
            id: pokemonId,
            name: getName(pokemonId),
            tier: pokemonTierMap.get(pokemonId),
            cost,
            types: getSpecies(pokemonId)?.types ?? [],
            capt: {
              tera: pick.addons?.includes("Tera Captain") || undefined,
            },
          };
        }),
      );

      const pointTotal = draftPicks
        .filter((pokemon) => pokemon.tier)
        .reduce((total, pokemon) => total + (pokemon.cost || 0), 0);

      const coach = team.coach;

      return {
        id: team._id.toString(),
        name: team.teamName,
        draft: draftPicks,
        logo: team.logo,
        isCoach,
        picks,
        pointTotal,
        timezone: coach.timezone,
        skipCount: team.skipCount || 0,
      };
    }),
  );

  teams.sort((a, b) => Number(b.isCoach) - Number(a.isCoach));
  return teams;
}

/**
 * Determines which teams are eligible to make a draft pick.
 * @param draft - The draft document.
 * @param pickOrder - The generated pick order.
 * @returns An array of team IDs that are eligible to draft.
 */
export function calculateCanDraft(
  draft: PopulatedDraft,
  pickOrder: PopulatedTeam[],
): string[] {
  const canDraft: string[] = [];
  if (draft.status !== "IN_PROGRESS") return canDraft;

  if (!draft.sequentialTurns) return pickOrder.map((t) => t._id.toString());

  if (draft.orderProgression === "snake") {
    const initialTeamOrder = getDraftOrder(draft);
    if (!initialTeamOrder || initialTeamOrder.length === 0) return canDraft;

    const picksExpected = new Map<string, number>();
    const counterLimit = Math.min(draft.counter, pickOrder.length);
    for (let i = 0; i < counterLimit; i++) {
      if (i >= pickOrder.length) break;
      const teamId = pickOrder[i]._id.toString();
      picksExpected.set(teamId, (picksExpected.get(teamId) || 0) + 1);
    }

    for (const team of initialTeamOrder) {
      const teamId = team._id.toString();
      const expected = picksExpected.get(teamId) || 0;
      if (team.pickLog.length < expected) {
        canDraft.push(teamId);
      }
    }

    if (draft.counter < pickOrder.length) {
      const currentPickingTeamId = pickOrder[draft.counter]._id.toString();
      if (!canDraft.includes(currentPickingTeamId)) {
        canDraft.push(currentPickingTeamId);
      }
    }
    return canDraft;
  }

  // Todo: Add support for linear draft

  return canDraft;
}

/**
 * Calculates the current pick number and round.
 * @param draft - The draft document.
 * @returns An object with the current round and position.
 */
export function calculateCurrentPick(draft: PopulatedDraft) {
  return {
    round: Math.floor(draft.counter / draft.teams.length),
    position: draft.counter % draft.teams.length,
    skipTime: draft.skipTime,
  };
}

export async function isCoach(
  team: PopulatedTeam,
  sub: string,
): Promise<boolean> {
  await team.populate<{ coach: CoachDocument }>("coach");

  return team.coach.auth0Id === sub;
}

export function getCurrentRound(draft: PopulatedDraft) {
  return Math.floor(draft.counter / draft.teams.length);
}

export function getCurrentPositionInRound(draft: PopulatedDraft) {
  return draft.counter % draft.teams.length;
}

export function getCurrentPickingTeam(
  draft: PopulatedDraft,
): PopulatedTeam | null {
  const teams = getDraftOrder(draft);
  if (!teams || teams.length === 0) return null;

  const currentRound = getCurrentRound(draft);
  const currentPositionInRound = getCurrentPositionInRound(draft);

  let pickingOrder = [...teams];
  if (draft.orderProgression === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }

  if (currentPositionInRound >= pickingOrder.length) {
    return null;
  }

  return pickingOrder[currentPositionInRound];
}

/**
 * Calculates the timer length for a team based on their skip count.
 * Timer is halved for each skip: baseTimer / (2^skipCount)
 * @param baseTimerLength - The base timer length in seconds. `Draft.timerLength`
 *   is an optional field (no schema default) — undefined falls back to the
 *   same 30s floor this function already clamps to, rather than guessing at
 *   a product-level default.
 * @param skipCount - The number of times this team has been skipped
 * @returns The calculated timer length in seconds (minimum 30 seconds)
 */
function calculateTeamTimer(
  baseTimerLength: number | undefined,
  skipCount: number,
): number {
  const calculatedTimer = (baseTimerLength ?? 30) / Math.pow(2, skipCount);
  return Math.max(30, calculatedTimer);
}

export async function canTeamDraft(
  draft: PopulatedDraft,
  team: PopulatedTeam,
): Promise<boolean> {
  if (draft.status !== "IN_PROGRESS") {
    return false;
  }

  const teams = getDraftOrder(draft);
  const teamsCount = teams.length;
  const currentRound = Math.floor(draft.counter / draft.teams.length);
  const currentPositionInRound = draft.counter % teamsCount;

  let pickingOrder = [...teams];
  if (draft.orderProgression === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }
  const teamIndexInPickingOrder = pickingOrder.findIndex((t) =>
    t._id.equals(team._id),
  );
  let pickCount: number;
  if (
    teamIndexInPickingOrder !== -1 &&
    teamIndexInPickingOrder <= currentPositionInRound
  ) {
    pickCount = currentRound + 1;
  } else {
    pickCount = currentRound;
  }
  const teamSize = team.pickLog.length;
  return teamSize < pickCount;
}

export function isAlreadyDrafted(draft: PopulatedDraft, pokemonId: string) {
  return draft.teams.some((t: PopulatedTeam) =>
    t.pickLog.some((p) => getPokemonIdFromDraft(p) === pokemonId),
  );
}

export async function getTeamPoints(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  team: PopulatedTeam,
) {
  const tierList = tournament.tierList;
  const teamPoints = team.pickLog.reduce(
    (total, draftPick) =>
      total +
      getPickCost(tierList, {
        pokemonId: getPokemonIdFromDraft(draftPick),
        addons: draftPick.addons,
      }),
    0,
  );
  return teamPoints;
}

export async function teamHasEnoughPoints(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPick,
): Promise<boolean> {
  const tierList = tournament.tierList;
  if (!tierList.pokemon.has(pick.pokemonId)) return false;

  const pickCost = getPickCost(tierList, pick);
  const maxPoints = tierList.pointTotal;
  if (!maxPoints) return true;

  const currentTeamPoints = await getTeamPoints(tournament, team);
  const projectedPoints = currentTeamPoints + pickCost;
  const picksAfterThis = team.pickLog.length + 1;
  const minPicksRequired = Math.max(tierList.draftCount.min, picksAfterThis);
  const pickCeiling = maxPoints + picksAfterThis - minPicksRequired;

  return projectedPoints <= pickCeiling;
}

export async function canBeDrafted(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPick,
): Promise<boolean> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") return false;

  const tierList = tournament.tierList;
  if (!areAddonsValid(tierList, pick)) {
    return false;
  }

  return (
    !isAlreadyDrafted(draft, pick.pokemonId) &&
    (await teamHasEnoughPoints(tournament, draft, team, pick))
  );
}

export async function canBeDraftedWithReason(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPick,
): Promise<{ canDraft: boolean; reason?: string }> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") {
    return { canDraft: false, reason: "Invalid Pokemon ID" };
  }

  const tierList = tournament.tierList;
  if (!areAddonsValid(tierList, pick)) {
    return {
      canDraft: false,
      reason: "Invalid addon selection for this Pokemon",
    };
  }

  if (isAlreadyDrafted(draft, pick.pokemonId)) {
    return {
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    };
  }

  if (!(await teamHasEnoughPoints(tournament, draft, team, pick))) {
    return {
      canDraft: false,
      reason: "Team does not have enough points to draft this Pokemon",
    };
  }

  return { canDraft: true };
}

export async function currentTeamPicks(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  session?: ClientSession,
): Promise<TeamPick[] | null> {
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

export async function draftPokemon(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  pick: TeamPick,
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

    const tier = await getPokemonTier(tournament._id, pick.pokemonId);

    const snipeCount = await removePokemonFromPicks(
      currentDraft,
      pick.pokemonId,
      session,
      currentTeamId,
    );

    const numberOfRounds = tournament.tierList.draftCount.max;
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
      eventEmitter.emit("draft.added", {
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
      const pokemon = {
        name: pokemonSpecie.name,
        id: pick.pokemonId,
      };

      await currentTeam.populate<{
        coach: CoachDocument;
      }>("coach");

      const coachMention = await resolveDiscordMention(
        currentDraft.channelId,
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
        sendDiscordMessage(currentDraft.channelId, {
          content: messageContent,
          embed: {
            title: `${currentTeam.teamName} drafted ${pokemon.name}!`,
            color,
            // Best-guess server-side rename; the Angular client's
            // /divisions/ route isn't updated this pass (see plan Section 0).
            url: `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/drafts/${currentDraft.draftKey}/draft`,
            fields,
            image: `https://play.pokemonshowdown.com/sprites/gen5/${pokemon.id}.png`,
          },
        });
      });
    }

    await checkCounterIncrease(tournament, currentDraft, currentTeam, session);

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

export async function isTeamDoneDrafting(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
): Promise<boolean> {
  const tierList = tournament.tierList;
  if (team.pickLog.length >= tierList.draftCount.max) return true;

  const teamPoints = await getTeamPoints(tournament, team);
  if (teamPoints >= tierList.pointTotal) return true;

  const picksRemaining = tierList.draftCount.max - team.pickLog.length;
  if (picksRemaining <= 0) return true;

  const pointsRemaining = tierList.pointTotal - teamPoints;
  if (pointsRemaining < 1) return true;

  return false;
}

export function isDraftComplete(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
): boolean {
  const tierList = tournament.tierList;
  const totalPicksNeeded = draft.teams.length * tierList.draftCount.max;

  if (draft.counter >= totalPicksNeeded) return true;

  const allTeamsDone = draft.teams.every(
    (team: PopulatedTeam) => team.pickLog.length >= tierList.draftCount.max,
  );

  return allTeamsDone;
}
export async function increaseCounter(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  session?: ClientSession,
) {
  try {
    const tierList = tournament.tierList;
    const numberOfRounds = tierList.draftCount.max;
    const initialTeamOrder = getDraftOrder(draft);
    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      draft.orderProgression,
    );

    if (draft.status !== "IN_PROGRESS") return;

    if (isDraftComplete(tournament, draft)) {
      await completeDraft(tournament, draft, session);
      return;
    }

    draft.counter++;

    if (draft.counter >= pickOrder.length) {
      await completeDraft(tournament, draft, session);
      return;
    }

    if (session) {
      queueSideEffect(session, () => cancelSkipPick(draft as any));
    }
    let nextTeam = getCurrentPickingTeam(draft);

    if (!nextTeam) {
      await completeDraft(tournament, draft, session);
      return;
    }

    let skippedTeams = 0;
    const maxSkips = initialTeamOrder.length;

    while (await isTeamDoneDrafting(tournament, draft, nextTeam)) {
      skippedTeams++;

      if (skippedTeams > maxSkips || draft.counter >= pickOrder.length - 1) {
        await completeDraft(tournament, draft, session);
        return;
      }

      const fullTeam = await TeamMongooseModel.findById(
        nextTeam._id,
      ).populate<{
        coach: CoachDocument;
      }>("coach");
      if (fullTeam) {
        fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
        await fullTeam.save({ session });
        const teamIndex = draft.teams.findIndex((t) =>
          t._id.equals(fullTeam._id),
        );
        if (teamIndex !== -1) {
          draft.teams[teamIndex] = fullTeam as unknown as PopulatedTeam;
        }
      }
      draft.counter++;
      const newNextTeam = getCurrentPickingTeam(draft);
      if (!newNextTeam) {
        await completeDraft(tournament, draft, session);
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
      queueSideEffect(session, () => resumeSkipPick(tournament, draft as any));
    } else {
      const newSkipTime = new Date();
      const teamTimer = calculateTeamTimer(
        draft.timerLength,
        nextTeam.skipCount || 0,
      );
      newSkipTime.setSeconds(newSkipTime.getSeconds() + teamTimer);
      draft.skipTime = newSkipTime;
      await cancelSkipPick(draft as any);
      await resumeSkipPick(tournament, draft as any);
    }

    await nextTeam.populate<{
      coach: CoachDocument;
    }>("coach");

    const nextTeamPicks = await currentTeamPicks(
      tournament,
      draft,
      nextTeam,
      session,
    );
    if (nextTeamPicks) {
      await draft.save({ session });
      await draftPokemon(tournament, draft, nextTeam, nextTeamPicks[0], session);
    } else {
      queueSideEffect(session, async () => {
        eventEmitter.emit("draft.counter", {
          tournamentId: tournament.tournamentKey,
          draftId: draft.draftKey,
          currentPick: calculateCurrentPick(draft),
          nextTeam: nextTeam._id.toString(),
          canDraftTeams: calculateCanDraft(draft, pickOrder),
        });

        if (draft.channelId) {
          const nextCoachMention = await resolveDiscordMention(
            draft.channelId,
            nextTeam.coach.discordName,
          );
          const mentionText = nextCoachMention
            ? `${nextCoachMention}, it is now your turn!`
            : "It is now your turn!";
          await sendDiscordMessage(draft.channelId, mentionText);
        }
      });

      await draft.save({ session });
    }
  } catch (error) {
    console.error("Error in increaseCounter:", error);
    throw error;
  }
}

async function completeDraft(
  tournament: LeagueTournamentDocument,
  draft: PopulatedDraft,
  session?: ClientSession,
) {
  if (draft.status === "COMPLETED") return;

  draft.status = "COMPLETED";
  queueSideEffect(session, () => cancelSkipPick(draft as any));
  draft.skipTime = undefined;
  draft.remainingTime = undefined;

  await draft.save({ session });

  queueSideEffect(session, () => {
    eventEmitter.emit("draft.completed", {
      tournamentId: tournament.tournamentKey,
      draftId: draft.draftKey,
      draftName: draft.name,
    });

    if (draft.channelId) {
      sendDiscordMessage(draft.channelId, {
        content: `🎉 The draft for ${draft.name} has been completed!`,
        embed: {
          title: `${draft.name} Draft Complete`,
          // Best-guess server-side rename; the Angular client's
          // /divisions/ route isn't updated this pass (see plan Section 0).
          url: `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/drafts/${draft.draftKey}/draft`,
          description:
            "All teams have finished drafting. Good luck in your matches!",
          color: 0x00ff00,
        },
      });
    }
  });
}

export async function checkCounterIncrease(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  team: PopulatedTeam,
  session?: ClientSession,
) {
  const currentRound = Math.floor(draft.counter / draft.teams.length);
  const currentPickingTeam = getCurrentPickingTeam(draft);
  if (!currentPickingTeam) {
    await completeDraft(tournament, draft, session);
    return;
  }

  if (
    currentPickingTeam._id.equals(team._id) &&
    currentPickingTeam.pickLog.length >= currentRound + 1
  ) {
    await increaseCounter(tournament, draft, session);
  }
}

export async function getDraftDetails(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  userId: string,
) {
  const numberOfRounds = tournament.tierList.draftCount.max;
  const initialTeamOrder = getDraftOrder(draft);
  const pickOrder = generatePickOrder(
    initialTeamOrder,
    numberOfRounds,
    draft.orderProgression,
  );

  const teams = await getTeamsWithCoachStatus(
    draft,
    tournament,
    userId,
    numberOfRounds,
  );

  const canDraft = calculateCanDraft(draft, pickOrder);
  const currentPick = calculateCurrentPick(draft);

  const tierList = tournament.tierList;

  return {
    leagueName: tournament.name,
    draftName: draft.name,
    orderProgression: draft.orderProgression,
    sequentialTurns: draft.sequentialTurns,
    visibility: draft.visibility,
    allowRemovals: draft.allowRemovals,
    teamOrder: initialTeamOrder.map((team) => team._id),
    rounds: numberOfRounds,
    teams: teams,
    currentPick,
    skipTime: draft.skipTime,
    status: draft.status,
    canDraft,
    points: tierList.pointTotal,
    logo: tournament.logo,
  };
}

export async function skipCurrentPick(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
) {
  if (draft.status !== "IN_PROGRESS") return false;

  const team = getCurrentPickingTeam(draft);

  if (!team) return false;

  const fullTeam = await TeamMongooseModel.findById(team._id).populate<{
    coach: CoachDocument;
  }>("coach");
  const teamName = fullTeam?.teamName || "Unknown Team";

  if (fullTeam) {
    fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;

    await fullTeam.save();

    const teamIndex = draft.teams.findIndex((t) => t._id.equals(fullTeam._id));
    if (teamIndex !== -1) {
      draft.teams[teamIndex] = fullTeam as unknown as PopulatedTeam;
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

  eventEmitter.emit("league.draft.skip", {
    tournamentId: tournament.tournamentKey,
    draftId: draft.draftKey,
    teamName,
    skipCount: fullTeam?.skipCount || 1,
    newTimerLength,
  });

  if (draft.channelId) {
    const coachMention = await resolveDiscordMention(
      draft.channelId,
      fullTeam?.coach?.discordName,
    );
    const coachLabel = coachMention ?? "coach";
    sendDiscordMessage(draft.channelId, `${teamName} (${coachLabel}) was skipped!`);
  }

  await increaseCounter(tournament, draft);

  return true;
}

export function cancelSkipTime(draft: PopulatedDraft) {
  const now: Date = new Date();
  const differenceInMs = draft.skipTime
    ? draft.skipTime.getTime() - now.getTime()
    : 0;
  draft.remainingTime = differenceInMs / 1000;
}

export async function setDraftState(
  tournament: LeagueTournamentDocument & { tierList: LeagueTierListDocument },
  draft: PopulatedDraft,
  state: string,
) {
  const statusActions: { [key: string]: () => Promise<void> } = {
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

      const queuedPicks = await currentTeamPicks(tournament, draft, currentTeam);
      if (queuedPicks?.length) {
        await draftPokemon(tournament, draft, currentTeam, queuedPicks[0]);
        return;
      }

      await resumeSkipPick(tournament, draft as any);
    },
    pause: async () => {
      draft.status = "PAUSED";
      cancelSkipTime(draft);
      draft.skipTime = undefined;
      await cancelSkipPick(draft as any);
    },
  };

  const action = statusActions[state];

  if (action) {
    await action();
    await draft.save();
    eventEmitter.emit("draft.status", {
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

    sendDiscordMessage(draft.channelId, `The draft is now ${statusLabel}.`);
  }
}

async function removePokemonFromPicks(
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
