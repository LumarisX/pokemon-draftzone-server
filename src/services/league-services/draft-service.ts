import { toID } from "@pkmn/data";
import { APIEmbedField } from "discord.js";
import mongoose, { ClientSession } from "mongoose";
import { cancelSkipPick, resumeSkipPick, scheduleSkipPick } from "../../agenda";
import { resolveDiscordMention, sendDiscordMessage } from "../../discord";
import eventEmitter from "../../event-emitter";
import { LEAGUE_COACH_COLLECTION } from "../../models/league";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import LeagueDivisionModel, {
  LeagueDivisionDocument,
} from "../../models/league/division.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
  TeamPick,
} from "../../models/league/team.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { getName } from "../data-services/pokedex.service";
import { getPokemonTier } from "./tier-list-service";

type DeferredSideEffect = () => void | Promise<void>;
const sessionSideEffects = new WeakMap<ClientSession, DeferredSideEffect[]>();

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
export function getPokemonIdFromDraft(draft: TeamDraft): string {
  return draft.pokemon.id;
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
  tournament: LeagueTournamentDocument,
): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = tournament.tierList as LeagueTierListDocument;
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

export function getDraftOrder(
  division: LeagueDivisionDocument,
): LeagueTeamDocument[] {
  if (division.teams.length <= 1 || !division.useRandomDraftOrder)
    return division.teams as LeagueTeamDocument[];

  let seed = 0;
  const divisionId = division.id.toString();
  for (let i = 0; i < divisionId.length; i++) {
    seed = (seed << 5) - seed + divisionId.charCodeAt(i);
    seed = seed & seed;
  }
  const seededRandom = (index: number) => {
    const x = Math.sin((seed + index) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const shuffled = [...division.teams] as LeagueTeamDocument[];
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
 * @param draftStyle - The style of the draft ('snake' or 'linear').
 * @returns An array of LeagueTeamDocument representing the pick order.
 */
export function generatePickOrder(
  initialTeamOrder: LeagueTeamDocument[],
  numberOfRounds: number,
  draftStyle: "snake" | "linear",
): LeagueTeamDocument[] {
  const pickOrder: LeagueTeamDocument[] = [];
  for (let r = 0; r < numberOfRounds; r++) {
    let currentRoundOrder = [...initialTeamOrder];
    if (draftStyle === "snake" && r % 2 === 1) {
      currentRoundOrder.reverse();
    }
    pickOrder.push(...currentRoundOrder);
  }
  return pickOrder;
}

/**
 * Builds the draft board, both as a flat list and structured into rounds.
 * @param division - The division document.
 * @param pickOrder - The generated pick order.
 * @returns An object containing the flat draft board and the draft rounds.
 */
export async function buildDraftBoards(
  division: LeagueDivisionDocument,
  pickOrder: LeagueTeamDocument[],
): Promise<{ flatDraftBoard: DraftPick[]; draftRounds: DraftRound[] }> {
  const initialTeamOrder = getDraftOrder(division);
  const teamDraftCursors = new Map<string, number>();
  initialTeamOrder.forEach((t) => teamDraftCursors.set(t.id, 0));

  await division.populate<{
    teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
  }>({
    path: "teams",
    populate: {
      path: "coach",
      model: LEAGUE_COACH_COLLECTION,
    },
  });

  const flatDraftBoard: DraftPick[] = [];
  for (let i = 0; i < pickOrder.length; i++) {
    const team = pickOrder[i];
    const draftPick: DraftPick = {
      teamName: (team.coach as LeagueCoachDocument).teamName,
    };

    const cursor = teamDraftCursors.get(team.id)!;
    if (team.draft[cursor]) {
      const pokemonId = getPokemonIdFromDraft(team.draft[cursor]);
      draftPick.pokemon = {
        id: pokemonId,
        name: getName(pokemonId),
      };
      teamDraftCursors.set(team.id, cursor + 1);
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
 * @param division - The division document with populated teams and coach.
 * @param tournament - The league document.
 * @param userId - The auth0Id of the user making the request.
 * @param numberOfRounds - The total number of draft rounds.
 * @returns A promise that resolves to an array of team data.
 */
export async function getTeamsWithCoachStatus(
  division: LeagueDivisionDocument,
  tournament: LeagueTournamentDocument,
  userId: string,
  numberOfRounds: number,
): Promise<TeamWithCoachStatus[]> {
  const pokemonTierMap = createPokemonTierMap(tournament);

  const teams = await Promise.all(
    (
      division.teams as (LeagueTeamDocument & {
        coach: LeagueCoachDocument;
      })[]
    ).map(async (team) => {
      const isCoach = (team.coach as LeagueCoachDocument).auth0Id === userId;
      const maxPicks = numberOfRounds - team.draft.length;
      let picks: any[] = [];
      const tierList = tournament.tierList as LeagueTierListDocument;
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
      const draft = await Promise.all(
        team.draft.map(async (pick) => {
          const cost = getPickCost(tierList, {
            pokemonId: pick.pokemon.id,
            addons: pick.addons,
          });
          return {
            id: getPokemonIdFromDraft(pick),
            name: getName(getPokemonIdFromDraft(pick)),
            tier: pokemonTierMap.get(getPokemonIdFromDraft(pick)),
            cost,
          };
        }),
      );

      const pointTotal = draft
        .filter((pokemon) => pokemon.tier)
        .reduce((total, pokemon) => total + (pokemon.cost || 0), 0);

      const coach = team.coach as LeagueCoachDocument;

      return {
        id: team._id.toString(),
        name: coach.teamName,
        draft,
        logo: coach.logo,
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
 * @param division - The division document.
 * @param pickOrder - The generated pick order.
 * @returns An array of team IDs that are eligible to draft.
 */
export function calculateCanDraft(
  division: LeagueDivisionDocument,
  pickOrder: LeagueTeamDocument[],
): string[] {
  const canDraft: string[] = [];
  if (division.status !== "IN_PROGRESS") {
    return canDraft;
  }

  const initialTeamOrder = getDraftOrder(division);
  if (!initialTeamOrder || initialTeamOrder.length === 0) {
    return canDraft;
  }

  const picksExpected = new Map<string, number>();
  const counterLimit = Math.min(division.draftCounter, pickOrder.length);
  for (let i = 0; i < counterLimit; i++) {
    if (i >= pickOrder.length) break;
    const teamId = pickOrder[i].id;
    picksExpected.set(teamId, (picksExpected.get(teamId) || 0) + 1);
  }

  for (const team of initialTeamOrder) {
    const expected = picksExpected.get(team.id) || 0;
    if (team.draft.length < expected) {
      canDraft.push(team.id);
    }
  }

  if (division.draftCounter < pickOrder.length) {
    const currentPickingTeamId = pickOrder[division.draftCounter].id;
    if (!canDraft.includes(currentPickingTeamId)) {
      canDraft.push(currentPickingTeamId);
    }
  }
  return canDraft;
}

/**
 * Calculates the current pick number and round.
 * @param division - The division document.
 * @param teamsCount - The number of teams in the division.
 * @returns An object with the current round and position.
 */
export function calculateCurrentPick(division: LeagueDivisionDocument) {
  return {
    round: Math.floor(division.draftCounter / division.teams.length),
    position: division.draftCounter % division.teams.length,
    skipTime: division.skipTime,
  };
}

export async function isCoach(
  team: LeagueTeamDocument,
  sub: string,
): Promise<boolean> {
  await team.populate<{ coach: LeagueCoachDocument }>("coach");

  return (team.coach as LeagueCoachDocument).auth0Id === sub;
}

export function getCurrentRound(division: LeagueDivisionDocument) {
  return Math.floor(division.draftCounter / division.teams.length);
}

export function getCurrentPositionInRound(division: LeagueDivisionDocument) {
  return division.draftCounter % division.teams.length;
}

export function getCurrentPickingTeam(
  division: LeagueDivisionDocument,
): LeagueTeamDocument | null {
  const teams = getDraftOrder(division);
  if (!teams || teams.length === 0) return null;

  const currentRound = getCurrentRound(division);
  const currentPositionInRound = getCurrentPositionInRound(division);

  let pickingOrder = [...teams];
  if (division.draftStyle === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }

  if (currentPositionInRound >= pickingOrder.length) {
    return null;
  }

  return pickingOrder[currentPositionInRound];
}

export async function canTeamDraft(
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
): Promise<boolean> {
  if (division.status !== "IN_PROGRESS") {
    return false;
  }

  const teams = getDraftOrder(division);
  const teamsCount = teams.length;
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length,
  );
  const currentPositionInRound = division.draftCounter % teamsCount;

  let pickingOrder = [...teams];
  if (division.draftStyle === "snake" && currentRound % 2 === 1) {
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
  const teamSize = team.draft.length;
  return teamSize < pickCount;
}

export function isAlreadyDrafted(
  division: LeagueDivisionDocument,
  pokemonId: string,
) {
  return (division.teams as LeagueTeamDocument[]).some((t) =>
    t.draft.some((p) => getPokemonIdFromDraft(p) === pokemonId),
  );
}

export async function getTeamPoints(
  tournament: LeagueTournamentDocument,
  team: LeagueTeamDocument,
) {
  await tournament.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = tournament.tierList as LeagueTierListDocument;
  const teamPoints = team.draft.reduce(
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
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pick: TeamPick,
): Promise<boolean> {
  await tournament.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = tournament.tierList as LeagueTierListDocument;
  if (!tierList.pokemon.has(pick.pokemonId)) return false;

  const pickCost = getPickCost(tierList, pick);
  const maxPoints = tierList.pointTotal;
  if (!maxPoints) return true;

  const currentTeamPoints = await getTeamPoints(tournament, team);
  const projectedPoints = currentTeamPoints + pickCost;
  const picksAfterThis = team.draft.length + 1;
  const minPicksRequired = Math.max(tierList.draftCount.min, picksAfterThis);
  const pickCeiling = maxPoints + picksAfterThis - minPicksRequired;

  return projectedPoints <= pickCeiling;
}

export async function canBeDrafted(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pick: TeamPick,
): Promise<boolean> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") return false;

  const tierList = tournament.tierList as LeagueTierListDocument;
  if (!areAddonsValid(tierList, pick)) {
    return false;
  }

  return (
    !isAlreadyDrafted(division, pick.pokemonId) &&
    (await teamHasEnoughPoints(tournament, division, team, pick))
  );
}

export async function canBeDraftedWithReason(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pick: TeamPick,
): Promise<{ canDraft: boolean; reason?: string }> {
  if (!pick.pokemonId || pick.pokemonId.trim() === "") {
    return { canDraft: false, reason: "Invalid Pokemon ID" };
  }

  const tierList = tournament.tierList as LeagueTierListDocument;
  if (!areAddonsValid(tierList, pick)) {
    return {
      canDraft: false,
      reason: "Invalid addon selection for this Pokemon",
    };
  }

  if (isAlreadyDrafted(division, pick.pokemonId)) {
    return {
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    };
  }

  if (!(await teamHasEnoughPoints(tournament, division, team, pick))) {
    return {
      canDraft: false,
      reason: "Team does not have enough points to draft this Pokemon",
    };
  }

  return { canDraft: true };
}

export async function currentTeamPicks(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession,
): Promise<TeamPick[] | null> {
  if (!team.picks.length || !team.picks[0].length) return null;

  const validationResults = await Promise.all(
    team.picks[0].map(async (pick) => ({
      pick,
      isValid: await canBeDrafted(tournament, division, team, {
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
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pick: TeamPick,
  session?: ClientSession,
) {
  let newSession = false;
  if (!session) {
    session = await mongoose.startSession();
    session.startTransaction();
    newSession = true;
  }

  let currentDivision = division;
  let currentTeam = team;

  try {
    const dbDivision = await LeagueDivisionModel.findById(division._id)
      .populate<{ teams: LeagueTeamDocument[] }>("teams")
      .session(session);
    if (!dbDivision) {
      throw new Error("Division not found.");
    }

    currentDivision = dbDivision;
    const dbTeam = (currentDivision.teams as LeagueTeamDocument[]).find((t) =>
      t._id.equals(team._id),
    );
    if (!dbTeam) {
      throw new Error("Team not found in division.");
    }
    currentTeam = dbTeam;

    if (!(await canTeamDraft(currentDivision, currentTeam))) {
      throw new Error("It is not this team's turn to draft.");
    }

    const draftCheck = await canBeDraftedWithReason(
      tournament,
      currentDivision,
      currentTeam,
      pick,
    );
    if (!draftCheck.canDraft)
      throw new Error(draftCheck.reason || "Pokemon cannot be drafted.");

    const picker =
      (currentTeam.coach as LeagueCoachDocument)?._id ||
      (currentTeam.coach as LeagueTeamDocument["coach"]);

    currentTeam.draft.push({
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

    await currentTeam.populate<{ coach: LeagueCoachDocument }>("coach");

    const coach = currentTeam.coach as LeagueCoachDocument;

    const teamIndex = (currentDivision.teams as LeagueTeamDocument[]).findIndex(
      (t) => t.id === currentTeam.id,
    );
    if (teamIndex !== -1) {
      (currentDivision.teams as LeagueTeamDocument[])[teamIndex] = currentTeam;
    }

    const tier = await getPokemonTier(tournament._id, pick.pokemonId);

    const snipeCount = await removePokemonFromPicks(
      currentDivision,
      pick.pokemonId,
      session,
      currentTeam.id,
    );

    const numberOfRounds = (tournament.tierList as LeagueTierListDocument)
      .draftCount.max;
    const initialTeamOrder = getDraftOrder(currentDivision);

    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      currentDivision.draftStyle,
    );
    const canDraftTeams = calculateCanDraft(currentDivision, pickOrder);
    const pokemonName = getName(pick.pokemonId);

    const pokemonTierMap = createPokemonTierMap(tournament);

    const draft = await Promise.all(
      currentTeam.draft.map(async (pick) => ({
        id: getPokemonIdFromDraft(pick),
        name: getName(getPokemonIdFromDraft(pick)),
        tier: pokemonTierMap.get(getPokemonIdFromDraft(pick)),
      })),
    );
    queueSideEffect(session, () => {
      eventEmitter.emit("draft.added", {
        tournamentId: tournament.tournamentKey,
        divisionId: currentDivision.divisionKey,
        pick: {
          pokemon: {
            id: pick.pokemonId,
            name: pokemonName,
            tier: tier?.name,
          },
          team: {
            id: currentTeam.id,
            name: coach.teamName,
          },
          division: currentDivision.name,
        },
        canDraftTeams,
        team: {
          id: currentTeam.id,
          name: coach.teamName,
          draft,
        },
        currentPick: calculateCurrentPick(currentDivision),
      });
    });

    if (currentDivision.channelId) {
      const pokemon = {
        name: pokemonName,
        id: pick.pokemonId,
      };

      await currentTeam.populate<{
        coach: LeagueCoachDocument;
      }>({
        path: "coach",
        model: LEAGUE_COACH_COLLECTION,
      });

      const coachMention = await resolveDiscordMention(
        currentDivision.channelId,
        (currentTeam.coach as LeagueCoachDocument)?.discordName,
      );
      const messageContent = `${pokemon.name} was drafted by ${
        coachMention ?? "a coach"
      }.`;

      const currentRound = getCurrentRound(currentDivision);
      const currentPositionInRound = getCurrentPositionInRound(currentDivision);

      const fields: APIEmbedField[] = [
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
      ];

      if (snipeCount)
        fields.push({
          name: "Sniped Teams",
          value: snipeCount.toString(),
          inline: true,
        });
      queueSideEffect(session, () => {
        sendDiscordMessage(currentDivision.channelId, {
          content: messageContent,
          embed: {
            title: `${coach.teamName} drafted ${pokemon.name}!`,
            url: `https://pokemondraftzone.com/leagues/pdbl/tournaments/${tournament.tournamentKey}/divisions/${currentDivision.divisionKey}/draft`,
            fields,
            image: `https://play.pokemonshowdown.com/sprites/gen5/${pokemon.id}.png`,
          },
        });
      });
    }

    await checkCounterIncrease(
      tournament,
      currentDivision,
      currentTeam,
      session,
    );

    division.set(currentDivision.toObject());
    team.set(currentTeam.toObject());

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
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
): Promise<boolean> {
  await tournament.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = tournament.tierList as LeagueTierListDocument;
  if (team.draft.length >= tierList.draftCount.max) return true;

  const teamPoints = await getTeamPoints(tournament, team);
  if (teamPoints >= tierList.pointTotal) return true;

  const picksRemaining = tierList.draftCount.max - team.draft.length;
  if (picksRemaining <= 0) return true;

  const pointsRemaining = tierList.pointTotal - teamPoints;
  if (pointsRemaining < 1) return true;

  return false;
}

export function isDraftComplete(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
): boolean {
  const tierList = league.tierList as LeagueTierListDocument;
  const totalPicksNeeded =
    (division.teams as LeagueTeamDocument[]).length * tierList.draftCount.max;

  if (division.draftCounter >= totalPicksNeeded) return true;

  const allTeamsDone = (division.teams as LeagueTeamDocument[]).every(
    (team) => team.draft.length >= tierList.draftCount.max,
  );

  return allTeamsDone;
}
export async function increaseCounter(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  session?: ClientSession,
) {
  try {
    const tierList = tournament.tierList as LeagueTierListDocument;
    const numberOfRounds = tierList.draftCount.max;
    const initialTeamOrder = getDraftOrder(division);
    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      division.draftStyle,
    );
    if (division.status !== "IN_PROGRESS") {
      return;
    }

    if (isDraftComplete(tournament, division)) {
      await completeDraft(tournament, division, session);
      return;
    }

    division.draftCounter++;

    if (division.draftCounter >= pickOrder.length) {
      await completeDraft(tournament, division, session);
      return;
    }

    queueSideEffect(session, () => cancelSkipPick(division));

    let nextTeam = getCurrentPickingTeam(division);
    if (!nextTeam) {
      await completeDraft(tournament, division, session);
      return;
    }

    let skippedTeams = 0;
    const maxSkips = initialTeamOrder.length;

    while (await isTeamDoneDrafting(tournament, division, nextTeam)) {
      skippedTeams++;
      if (
        skippedTeams > maxSkips ||
        division.draftCounter >= pickOrder.length - 1
      ) {
        await completeDraft(tournament, division, session);
        return;
      }

      const fullTeam = (await LeagueTeamModel.findById(nextTeam._id).populate(
        "coach",
      )) as (LeagueTeamDocument & { coach: LeagueCoachDocument }) | null;
      if (fullTeam) {
        fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
        await fullTeam.save({ session });
        const teamIndex = (division.teams as LeagueTeamDocument[]).findIndex(
          (t) => t._id.equals(fullTeam._id),
        );
        if (teamIndex !== -1) {
          (division.teams as LeagueTeamDocument[])[teamIndex] = fullTeam;
        }
      }

      division.draftCounter++;
      const newNextTeam = getCurrentPickingTeam(division);
      if (!newNextTeam) {
        await completeDraft(tournament, division, session);
        return;
      }
      nextTeam = newNextTeam;
    }

    if (session) {
      const newSkipTime = new Date();
      newSkipTime.setSeconds(newSkipTime.getSeconds() + division.timerLength);
      division.skipTime = newSkipTime;
      queueSideEffect(session, () => resumeSkipPick(tournament, division));
    } else {
      await scheduleSkipPick(tournament, division);
    }

    await nextTeam.populate<{
      coach: LeagueCoachDocument;
    }>({
      path: "coach",
      model: LEAGUE_COACH_COLLECTION,
    });

    const nextTeamPicks = await currentTeamPicks(
      tournament,
      division,
      nextTeam,
      session,
    );
    if (nextTeamPicks) {
      await draftPokemon(
        tournament,
        division,
        nextTeam,
        nextTeamPicks[0],
        session,
      );
    } else {
      queueSideEffect(session, async () => {
        eventEmitter.emit("draft.counter", {
          tournamentId: tournament.tournamentKey,
          divisionId: division.divisionKey,
          currentPick: calculateCurrentPick(division),
          nextTeam: nextTeam._id.toString(),
          canDraftTeams: calculateCanDraft(division, pickOrder),
        });

        if (division.channelId) {
          const nextCoachMention = await resolveDiscordMention(
            division.channelId,
            (nextTeam.coach as LeagueCoachDocument).discordName,
          );
          const mentionText = nextCoachMention
            ? `${nextCoachMention}, it is now your turn!`
            : "It is now your turn!";
          await sendDiscordMessage(division.channelId, mentionText);
        }
      });
    }

    await division.save({ session });
  } catch (error) {
    console.error("Error in increaseCounter:", error);
    throw error;
  }
}

async function completeDraft(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  session?: ClientSession,
) {
  if (division.status === "COMPLETED") return;

  division.status = "COMPLETED";
  queueSideEffect(session, () => cancelSkipPick(division));
  division.skipTime = undefined;
  division.remainingTime = undefined;

  await division.save({ session });

  queueSideEffect(session, () => {
    eventEmitter.emit("draft.completed", {
      tournamentId: tournament.tournamentKey,
      divisionId: division.divisionKey,
      divisionName: division.name,
    });

    if (division.channelId) {
      sendDiscordMessage(division.channelId, {
        content: `🎉 The draft for ${division.name} has been completed!`,
        embed: {
          title: `${division.name} Draft Complete`,
          url: `https://pokemondraftzone.com/leagues/${tournament.tournamentKey}/${division.divisionKey}/draft`,
          description:
            "All teams have finished drafting. Good luck in your matches!",
          color: 0x00ff00,
        },
      });
    }
  });
}

export async function checkCounterIncrease(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession,
) {
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length,
  );
  const currentPickingTeam = getCurrentPickingTeam(division);
  if (!currentPickingTeam) {
    await completeDraft(tournament, division, session);
    return;
  }

  if (
    currentPickingTeam._id.equals(team._id) &&
    currentPickingTeam.draft.length >= currentRound + 1
  ) {
    await increaseCounter(tournament, division, session);
  }
}

export async function getDivisionDetails(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  userId: string,
) {
  const numberOfRounds = (tournament.tierList as LeagueTierListDocument)
    .draftCount.max;
  const initialTeamOrder = getDraftOrder(division);

  const pickOrder = generatePickOrder(
    initialTeamOrder,
    numberOfRounds,
    division.draftStyle,
  );

  await division.populate<{
    teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
  }>({
    path: "teams",
    populate: {
      path: "coach",
      model: LEAGUE_COACH_COLLECTION,
    },
  });

  const teams = await getTeamsWithCoachStatus(
    division,
    tournament,
    userId,
    numberOfRounds,
  );

  const canDraft = calculateCanDraft(division, pickOrder);
  const currentPick = calculateCurrentPick(division);

  await tournament.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = tournament.tierList as LeagueTierListDocument;

  return {
    leagueName: tournament.name,
    divisionName: division.name,
    draftStyle: division.draftStyle,
    teamOrder: initialTeamOrder.map((team) => team._id),
    rounds: numberOfRounds,
    teams: teams,
    currentPick,
    skipTime: division.skipTime,
    status: division.status,
    canDraft,
    points: tierList.pointTotal,
  };
}

export async function skipCurrentPick(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
) {
  if (division.status !== "IN_PROGRESS") {
    return;
  }

  const team = getCurrentPickingTeam(division);
  if (!team) {
    return;
  }

  const fullTeam = (await LeagueTeamModel.findById(team._id).populate(
    "coach",
  )) as (LeagueTeamDocument & { coach: LeagueCoachDocument }) | null;
  const teamName =
    (fullTeam?.coach as LeagueCoachDocument)?.teamName || "Unknown Team";

  if (fullTeam) {
    fullTeam.skipCount = (fullTeam.skipCount || 0) + 1;
    await fullTeam.save();

    const teamIndex = (division.teams as LeagueTeamDocument[]).findIndex((t) =>
      t._id.equals(fullTeam._id),
    );
    if (teamIndex !== -1) {
      (division.teams as LeagueTeamDocument[])[teamIndex] = fullTeam;
    }
  }

  if (division.timerLength && division.skipTimerPenalty) {
    division.timerLength = Math.max(
      30,
      division.timerLength - division.skipTimerPenalty,
    );
  }

  division.eventLog.push({
    eventType: "SKIP",
    details: `${teamName} was skipped`,
    timestamp: new Date(),
  });

  await division.save();

  eventEmitter.emit("league.draft.skip", {
    tournamentId: tournament.tournamentKey,
    divisionId: division.divisionKey,
    teamName,
    skipCount: fullTeam?.skipCount || 1,
    newTimerLength: division.timerLength,
  });

  if (division.channelId) {
    const coachMention = await resolveDiscordMention(
      division.channelId,
      (fullTeam?.coach as LeagueCoachDocument | undefined)?.discordName,
    );
    const coachLabel = coachMention ?? "coach";
    sendDiscordMessage(
      division.channelId,
      `${teamName} (${coachLabel}) was skipped!`,
    );
  }

  await increaseCounter(tournament, division);
}

export function cancelSkipTime(division: LeagueDivisionDocument) {
  const now: Date = new Date();
  const differenceInMs = division.skipTime
    ? division.skipTime.getTime() - now.getTime()
    : 0;
  division.remainingTime = differenceInMs / 1000;
}

export async function setDivsionState(
  tournament: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  state: string,
) {
  const statusActions: { [key: string]: () => Promise<void> } = {
    play: async () => {
      division.status = "IN_PROGRESS";
      const newSkipTime = new Date();
      const secondsToAdd = division.remainingTime ?? division.timerLength;
      newSkipTime.setSeconds(newSkipTime.getSeconds() + secondsToAdd);
      division.skipTime = newSkipTime;
      division.remainingTime = undefined;

      const currentTeam = getCurrentPickingTeam(division);
      if (!currentTeam) {
        return;
      }

      const queuedPicks = await currentTeamPicks(
        tournament,
        division,
        currentTeam,
      );
      if (queuedPicks?.length) {
        await draftPokemon(tournament, division, currentTeam, queuedPicks[0]);
        return;
      }

      await resumeSkipPick(tournament, division);
    },
    pause: async () => {
      division.status = "PAUSED";
      cancelSkipTime(division);
      division.skipTime = undefined;
      await cancelSkipPick(division);
    },
  };

  const action = statusActions[state];

  if (action) {
    await action();
    await division.save();
    eventEmitter.emit("draft.status", {
      tournamentId: tournament.tournamentKey,
      divisionId: division.divisionKey,
      status: division.status,
      currentPick: calculateCurrentPick(division),
    });

    const statusLabel =
      division.status === "IN_PROGRESS"
        ? "started"
        : division.status === "PAUSED"
          ? "paused"
          : division.status.toLowerCase();

    sendDiscordMessage(division.channelId, `The draft is now ${statusLabel}.`);
  }
}

async function removePokemonFromPicks(
  division: LeagueDivisionDocument,
  pokemonId: string,
  session?: ClientSession,
  skipTeamId?: string,
) {
  let teamsToProcess = division.teams as LeagueTeamDocument[];
  if (skipTeamId) {
    teamsToProcess = teamsToProcess.filter((team) => team.id !== skipTeamId);
  }

  const teamsWithPick = teamsToProcess.filter((team) =>
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
