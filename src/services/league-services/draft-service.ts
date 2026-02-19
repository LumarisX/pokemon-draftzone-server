import { toID } from "@pkmn/data";
import { APIEmbedField } from "discord.js";
import mongoose, { ClientSession } from "mongoose";
import { cancelSkipPick, resumeSkipPick, scheduleSkipPick } from "../../agenda";
import { resolveDiscordMention, sendDiscordMessage } from "../../discord";
import eventEmitter from "../../event-emitter";
import { LEAGUE_COACH_COLLECTION } from "../../models/league";
import { LeagueCoachDocument } from "../../models/league/coach.model";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
  TeamPick,
} from "../../models/league/team.model";
import { LeagueTierListDocument } from "../../models/league/tier-list.model";
import { LeagueTournamentDocument } from "../../models/league/tournament.model";
import { getName } from "../data-services/pokedex.service";
import { getPokemonTier } from "./tier-list-service";

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
 * @param league - The league document with a populated tierList
 * @returns A map where keys are pokemonIds and values are tier names
 */
function createPokemonTierMap(
  league: LeagueTournamentDocument,
): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = league.tierList as LeagueTierListDocument;
  Array.from(tierList.pokemon.entries()).forEach(([pokemonId, data]) => {
    tierMap.set(pokemonId, data.tier);
  });
  return tierMap;
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
 * @param league - The league document.
 * @param userId - The auth0Id of the user making the request.
 * @param numberOfRounds - The total number of draft rounds.
 * @returns A promise that resolves to an array of team data.
 */
export async function getTeamsWithCoachStatus(
  division: LeagueDivisionDocument,
  league: LeagueTournamentDocument,
  userId: string,
  numberOfRounds: number,
): Promise<TeamWithCoachStatus[]> {
  const pokemonTierMap = createPokemonTierMap(league);
  const tierCostMap = new Map(
    (league.tierList as LeagueTierListDocument).tiers.map((tier) => [
      tier.name,
      tier.cost,
    ]),
  );

  const teams = await Promise.all(
    (
      division.teams as (LeagueTeamDocument & {
        coach: LeagueCoachDocument;
      })[]
    ).map(async (team) => {
      const isCoach = (team.coach as LeagueCoachDocument).auth0Id === userId;
      const maxPicks = numberOfRounds - team.draft.length;
      let picks: any[] = [];
      const tierList = league.tierList as LeagueTierListDocument;
      if (isCoach) {
        const processedPicks = await Promise.all(
          team.picks.slice(0, maxPicks).map(async (round) =>
            Promise.all(
              round.map(async (pick) => {
                const cost = pick.addons?.length
                  ? tierList.pokemon.get(pick.pokemonId)!.addons![0].cost
                  : tierList.tiers.find(
                      (tier) =>
                        tierList.pokemon.get(pick.pokemonId)?.tier ===
                        tier.name,
                    )?.cost || 0;
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
          const cost = pick.addons?.length
            ? tierList.pokemon.get(pick.pokemon.id)!.addons![0].cost
            : tierList.tiers.find(
                (tier) =>
                  tierList.pokemon.get(pick.pokemon.id)?.tier === tier.name,
              )?.cost || 0;
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
  league: LeagueTournamentDocument,
  team: LeagueTeamDocument,
) {
  const tiers = await Promise.all(
    team.draft.map(async (pick) => {
      const tier = await getPokemonTier(league, getPokemonIdFromDraft(pick));
      return tier?.cost || 0;
    }),
  );
  const teamPoints = tiers.reduce((total, tier) => total + tier, 0);
  return teamPoints;
}

export async function teamHasEnoughPoints(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string,
): Promise<boolean> {
  const tier = await getPokemonTier(league, pokemonId);
  if (!tier) return false;
  const tierList = league.tierList as LeagueTierListDocument;
  const maxPoints = tierList.pointTotal;
  if (!maxPoints) return true;

  const currentTeamPoints = await getTeamPoints(league, team);
  const projectedPoints = currentTeamPoints + tier.cost;
  const picksAfterThis = team.draft.length + 1;
  const minPicksRequired = Math.max(tierList.draftCount.min, picksAfterThis);
  const pickCeiling = maxPoints + picksAfterThis - minPicksRequired;

  return projectedPoints <= pickCeiling;
}

export async function canBeDrafted(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string,
): Promise<boolean> {
  if (!pokemonId || pokemonId.trim() === "") return false;
  return (
    !isAlreadyDrafted(division, pokemonId) &&
    (await teamHasEnoughPoints(league, division, team, pokemonId))
  );
}

export async function canBeDraftedWithReason(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string,
): Promise<{ canDraft: boolean; reason?: string }> {
  if (!pokemonId || pokemonId.trim() === "") {
    return { canDraft: false, reason: "Invalid Pokemon ID" };
  }

  if (isAlreadyDrafted(division, pokemonId)) {
    return {
      canDraft: false,
      reason: "Pokemon has already been drafted by another team",
    };
  }

  if (!(await teamHasEnoughPoints(league, division, team, pokemonId))) {
    return {
      canDraft: false,
      reason: "Team does not have enough points to draft this Pokemon",
    };
  }

  return { canDraft: true };
}

export async function currentTeamPicks(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession,
): Promise<TeamPick[] | null> {
  if (!team.picks.length || !team.picks[0].length) return null;

  const validationResults = await Promise.all(
    team.picks[0].map(async (pick) => ({
      pick,
      isValid: await canBeDrafted(league, division, team, pick.pokemonId),
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
  league: LeagueTournamentDocument,
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
  try {
    if (!(await canTeamDraft(division, team))) {
      throw new Error("It is not this team's turn to draft.");
    }

    const draftCheck = await canBeDraftedWithReason(
      league,
      division,
      team,
      pick.pokemonId,
    );
    if (!draftCheck.canDraft)
      throw new Error(draftCheck.reason || "Pokemon cannot be drafted.");

    const picker =
      (team.coach as LeagueCoachDocument)?._id ||
      (team.coach as LeagueTeamDocument["coach"]);

    team.draft.push({
      pokemon: {
        id: toID(pick.pokemonId),
      },
      picker,
      addons: pick.addons,
      timestamp: new Date(),
    });

    if (team.picks.length > 0) {
      team.picks.shift();
    }

    team.picks = team.picks.map((round) =>
      round.filter((p) => p.pokemonId !== pick.pokemonId),
    );

    await team.save({ session });

    await team.populate<{ coach: LeagueCoachDocument }>("coach");

    const coach = team.coach as LeagueCoachDocument;

    const teamIndex = (division.teams as LeagueTeamDocument[]).findIndex(
      (t) => t.id === team.id,
    );
    if (teamIndex !== -1) {
      (division.teams as LeagueTeamDocument[])[teamIndex] = team;
    }

    const tier = await getPokemonTier(league._id, pick.pokemonId);

    const snipeCount = await removePokemonFromPicks(
      division,
      pick.pokemonId,
      session,
      team.id,
    );

    const numberOfRounds = (league.tierList as LeagueTierListDocument)
      .draftCount.max;
    const initialTeamOrder = getDraftOrder(division);

    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      division.draftStyle,
    );
    const canDraftTeams = calculateCanDraft(division, pickOrder);
    const pokemonName = getName(pick.pokemonId);

    const pokemonTierMap = createPokemonTierMap(league);

    const draft = await Promise.all(
      team.draft.map(async (pick) => ({
        id: getPokemonIdFromDraft(pick),
        name: getName(getPokemonIdFromDraft(pick)),
        tier: pokemonTierMap.get(getPokemonIdFromDraft(pick)),
      })),
    );
    eventEmitter.emit("draft.added", {
      tournamentId: league.tournamentKey,
      divisionId: division.divisionKey,
      pick: {
        pokemon: {
          id: pick.pokemonId,
          name: pokemonName,
          tier: tier?.name,
        },
        team: {
          id: team.id,
          name: coach.teamName,
        },
        division: division.name,
      },
      canDraftTeams,
      team: {
        id: team.id,
        name: coach.teamName,
        draft,
      },
      currentPick: calculateCurrentPick(division),
    });

    if (division.channelId) {
      const pokemon = {
        name: pokemonName,
        id: pick.pokemonId,
      };

      await team.populate<{
        coach: LeagueCoachDocument;
      }>({
        path: "coach",
        model: LEAGUE_COACH_COLLECTION,
      });

      const coachMention = await resolveDiscordMention(
        division.channelId,
        (team.coach as LeagueCoachDocument)?.discordName,
      );
      const messageContent = `${pokemon.name} was drafted by ${
        coachMention ?? "a coach"
      }.`;

      const currentRound = getCurrentRound(division);
      const currentPositionInRound = getCurrentPositionInRound(division);

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
      sendDiscordMessage(division.channelId, {
        content: messageContent,
        embed: {
          title: `${coach.teamName} drafted ${pokemon.name}!`,
          url: `https://pokemondraftzone.com/leagues/pdbl/tournaments/${league.tournamentKey}/divisions/${division.divisionKey}/draft`,
          fields,
          image: `https://play.pokemonshowdown.com/sprites/gen5/${pokemon.id}.png`,
        },
      });
    }

    await checkCounterIncrease(league, division, team, session);
    if (newSession) {
      await session.commitTransaction();
    }
  } catch (error) {
    if (newSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (newSession) {
      session.endSession();
    }
  }
}

export async function isTeamDoneDrafting(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
): Promise<boolean> {
  await league.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = league.tierList as LeagueTierListDocument;
  if (team.draft.length >= tierList.draftCount.max) return true;

  const teamPoints = await getTeamPoints(league, team);
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
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  session?: ClientSession,
) {
  try {
    const tierList = league.tierList as LeagueTierListDocument;
    const numberOfRounds = tierList.draftCount.max;
    const initialTeamOrder = division.teams as LeagueTeamDocument[];
    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      division.draftStyle,
    );
    if (division.status !== "IN_PROGRESS") {
      return;
    }

    if (isDraftComplete(league, division)) {
      await completeDraft(league, division, session);
      return;
    }

    division.draftCounter++;

    if (division.draftCounter >= pickOrder.length) {
      await completeDraft(league, division, session);
      return;
    }

    await cancelSkipPick(division);

    let nextTeam = getCurrentPickingTeam(division);
    if (!nextTeam) {
      await completeDraft(league, division, session);
      return;
    }

    let skippedTeams = 0;
    const maxSkips = initialTeamOrder.length;

    while (await isTeamDoneDrafting(league, division, nextTeam)) {
      skippedTeams++;
      if (
        skippedTeams > maxSkips ||
        division.draftCounter >= pickOrder.length - 1
      ) {
        await completeDraft(league, division, session);
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
        await completeDraft(league, division, session);
        return;
      }
      nextTeam = newNextTeam;
    }

    await scheduleSkipPick(league, division);

    await nextTeam.populate<{
      coach: LeagueCoachDocument;
    }>({
      path: "coach",
      model: LEAGUE_COACH_COLLECTION,
    });

    const nextTeamPicks = await currentTeamPicks(
      league,
      division,
      nextTeam,
      session,
    );
    if (nextTeamPicks) {
      await draftPokemon(league, division, nextTeam, nextTeamPicks[0], session);
    } else {
      eventEmitter.emit("draft.counter", {
        tournamentId: league.tournamentKey,
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
        sendDiscordMessage(division.channelId, mentionText);
      }
    }

    await division.save({ session });
  } catch (error) {
    console.error("Error in increaseCounter:", error);
    throw error;
  }
}

async function completeDraft(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  session?: ClientSession,
) {
  if (division.status === "COMPLETED") return;

  division.status = "COMPLETED";
  await cancelSkipPick(division);
  division.skipTime = undefined;
  division.remainingTime = undefined;

  await division.save({ session });

  eventEmitter.emit("draft.completed", {
    tournamentId: league.tournamentKey,
    divisionId: division.divisionKey,
    divisionName: division.name,
  });

  if (division.channelId) {
    sendDiscordMessage(division.channelId, {
      content: `🎉 The draft for ${division.name} has been completed!`,
      embed: {
        title: `${division.name} Draft Complete`,
        url: `https://pokemondraftzone.com/leagues/${league.tournamentKey}/${division.divisionKey}/draft`,
        description:
          "All teams have finished drafting. Good luck in your matches!",
        color: 0x00ff00,
      },
    });
  }
}

export async function checkCounterIncrease(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession,
) {
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length,
  );
  const currentPickingTeam = getCurrentPickingTeam(division);
  if (!currentPickingTeam) {
    await completeDraft(league, division, session);
    return;
  }

  if (
    currentPickingTeam._id.equals(team._id) &&
    currentPickingTeam.draft.length >= currentRound + 1
  ) {
    await increaseCounter(league, division, session);
  }
}

export async function getDivisionDetails(
  league: LeagueTournamentDocument,
  division: LeagueDivisionDocument,
  userId: string,
) {
  const numberOfRounds = (league.tierList as LeagueTierListDocument).draftCount
    .max;
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
    league,
    userId,
    numberOfRounds,
  );

  const canDraft = calculateCanDraft(division, pickOrder);
  const currentPick = calculateCurrentPick(division);

  await league.populate<{
    tierList: LeagueTierListDocument;
  }>("tierList");

  const tierList = league.tierList as LeagueTierListDocument;

  return {
    leagueName: league.name,
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
  league: LeagueTournamentDocument,
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
    tournamentId: league.tournamentKey,
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

  await increaseCounter(league, division);
}

export function cancelSkipTime(division: LeagueDivisionDocument) {
  const now: Date = new Date();
  const differenceInMs = division.skipTime
    ? division.skipTime.getTime() - now.getTime()
    : 0;
  division.remainingTime = differenceInMs / 1000;
}

export async function setDivsionState(
  league: LeagueTournamentDocument,
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
      await resumeSkipPick(league, division);
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
      tournamentId: league.tournamentKey,
      divisionId: division.divisionKey,
      status: division.status,
      currentPick: calculateCurrentPick(division),
    });
    sendDiscordMessage(
      division.channelId,
      `The Draft is now ${division.status}`,
    );
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
