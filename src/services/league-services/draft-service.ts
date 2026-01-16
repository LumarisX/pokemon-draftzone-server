import mongoose, { ClientSession } from "mongoose";
import { cancelSkipPick, resumeSkipPick, scheduleSkipPick } from "../../agenda";
import { sendDiscordMessage } from "../../discord";
import eventEmitter from "../../event-emitter";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import { LeagueDocument } from "../../models/league/league.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import { DraftTierListDocument } from "../../models/league/tier-list.model";
import { LeagueUserDocument } from "../../models/league/user.model";
import { getName } from "../data-services/pokedex.service";
import { getPokemonTier } from "./tier-service";
import { APIEmbedField } from "discord.js";

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
};

/**
 * Creates a map of pokemonId to tier for faster lookups
 * @param league - The league document with a populated tierList
 * @returns A map where keys are pokemonIds and values are tier names
 */
function createPokemonTierMap(league: LeagueDocument): Map<string, string> {
  const tierMap = new Map<string, string>();
  const tierList = league.tierList as DraftTierListDocument;
  for (const tierGroup of tierList.tierGroups) {
    for (const tier of tierGroup.tiers) {
      for (const pokemon of tier.pokemon) {
        tierMap.set(pokemon, tier.name);
      }
    }
  }
  return tierMap;
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
  draftStyle: "snake" | "linear"
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
export function buildDraftBoards(
  division: LeagueDivisionDocument,
  pickOrder: LeagueTeamDocument[]
): { flatDraftBoard: DraftPick[]; draftRounds: DraftRound[] } {
  const initialTeamOrder = division.teams as LeagueTeamDocument[];
  const teamDraftCursors = new Map<string, number>();
  initialTeamOrder.forEach((t) => teamDraftCursors.set(t.id, 0));

  const flatDraftBoard: DraftPick[] = [];
  for (let i = 0; i < pickOrder.length; i++) {
    const team = pickOrder[i];
    const draftPick: DraftPick = { teamName: team.name };

    const cursor = teamDraftCursors.get(team.id)!;
    if (team.draft[cursor]) {
      const pokemonId = team.draft[cursor].pokemonId;
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
      flatDraftBoard.slice(i * teamsCount, (i + 1) * teamsCount)
    );
  }

  return { flatDraftBoard, draftRounds };
}

/**
 * Gathers and processes team information, including coach status and picks.
 * @param division - The division document with populated teams and coaches.
 * @param league - The league document.
 * @param userId - The auth0Id of the user making the request.
 * @param numberOfRounds - The total number of draft rounds.
 * @returns A promise that resolves to an array of team data.
 */
export async function getTeamsWithCoachStatus(
  division: LeagueDivisionDocument,
  league: LeagueDocument,
  userId: string,
  numberOfRounds: number
): Promise<TeamWithCoachStatus[]> {
  const pokemonTierMap = createPokemonTierMap(league);

  const teams = await Promise.all(
    (
      division.teams as (LeagueTeamDocument & {
        coaches: LeagueUserDocument[];
      })[]
    ).map(async (team) => {
      const isCoach = (team.coaches as LeagueUserDocument[]).some(
        (c) => c.auth0Id === userId
      );
      const maxPicks = numberOfRounds - team.draft.length;
      let picks: any[] = [];
      if (isCoach) {
        const processedPicks = await Promise.all(
          team.picks.slice(0, maxPicks).map(async (round) =>
            Promise.all(
              round.map(async (pick) => ({
                id: pick,
                name: getName(pick),
                tier: pokemonTierMap.get(pick),
              }))
            )
          )
        );
        picks = processedPicks;
        while (picks.length < maxPicks) {
          picks.push([]);
        }
      }
      const draft = await Promise.all(
        team.draft.map(async (pick) => ({
          id: pick.pokemonId,
          name: getName(pick.pokemonId),
          tier: pokemonTierMap.get(pick.pokemonId),
        }))
      );

      const pointTotal = draft
        .filter((pokemon) => pokemon.tier)
        .reduce((total, pokemon) => total + Number(pokemon.tier), 0);

      return {
        id: team._id.toString(),
        name: team.name,
        draft,
        logo: team.logo,
        isCoach,
        picks,
        pointTotal,
        timezone: team.timezone,
      };
    })
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
  pickOrder: LeagueTeamDocument[]
): string[] {
  const canDraft: string[] = [];
  if (division.status !== "IN_PROGRESS") {
    return canDraft;
  }

  const initialTeamOrder = division.teams as LeagueTeamDocument[];

  const picksExpected = new Map<string, number>();
  for (let i = 0; i < division.draftCounter; i++) {
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
  sub: string
): Promise<boolean> {
  await team.populate<{ coaches: LeagueUserDocument[] }>("coaches");

  return (team.coaches as LeagueUserDocument[]).some((c) => c.auth0Id === sub);
}

export function getCurrentRound(division: LeagueDivisionDocument) {
  return Math.floor(division.draftCounter / division.teams.length);
}

export function getCurrentPositionInRound(division: LeagueDivisionDocument) {
  return Math.floor(division.draftCounter % division.teams.length);
}

export function getCurrentPickingTeam(division: LeagueDivisionDocument) {
  const teams = division.teams as LeagueTeamDocument[];
  const currentRound = getCurrentRound(division);
  const currentPositionInRound = getCurrentPositionInRound(division);

  let pickingOrder = [...teams];
  if (division.draftStyle === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }

  return pickingOrder[currentPositionInRound];
}

export async function canTeamDraft(
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument
): Promise<boolean> {
  const teams = division.teams as LeagueTeamDocument[];
  const teamsCount = teams.length;
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length
  );
  const currentPositionInRound = division.draftCounter % teamsCount;

  let pickingOrder = [...teams];
  if (division.draftStyle === "snake" && currentRound % 2 === 1) {
    pickingOrder.reverse();
  }
  const teamIndexInPickingOrder = pickingOrder.findIndex((t) =>
    t._id.equals(team._id)
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
  pokemonId: string
) {
  return (division.teams as LeagueTeamDocument[]).some((t) =>
    t.draft.some((p) => p.pokemonId === pokemonId)
  );
}

export async function getTeamPoints(
  league: LeagueDocument,
  team: LeagueTeamDocument
) {
  const tiers = await Promise.all(
    team.draft.map(async (pick) => {
      const tier = await getPokemonTier(league, pick.pokemonId);
      return Number(tier) || 0;
    })
  );
  const teamPoints = tiers.reduce((total, tier) => total + tier, 0);
  return teamPoints;
}

export async function teamHasEnoughPoints(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string
): Promise<boolean> {
  const tier = await getPokemonTier(league, pokemonId);
  if (!tier) return false;
  const tierList = league.tierList as DraftTierListDocument;
  const maxPoints = tierList.points;
  if (!maxPoints) return true;
  const pickCeiling =
    maxPoints +
    team.draft.length +
    1 -
    Math.max(tierList.draftCount[0], team.draft.length + 1);
  const teamPoints = (await getTeamPoints(league, team)) + Number(tier);
  return teamPoints <= pickCeiling;
}

export async function canBeDrafted(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string
): Promise<boolean> {
  return (
    !isAlreadyDrafted(division, pokemonId) &&
    (await teamHasEnoughPoints(league, division, team, pokemonId))
  );
}

export async function currentTeamPicks(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession
): Promise<string[] | null> {
  if (!team.picks.length) return null;
  const picks = await Promise.all(
    team.picks[0].filter(
      async (pick) =>
        pick.trim() && (await canBeDrafted(league, division, team, pick))
    )
  );

  if (picks.length !== team.picks[0].length) {
    team.picks[0] = picks;
    team.save({ session });
  }
  if (!picks.length) return null;
  return picks;
}

export async function draftPokemon(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string,
  session?: ClientSession
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

    if (!(await canBeDrafted(league, division, team, pokemonId))) {
      throw new Error(`Pokemon can not be drafted.`);
    }

    if (!team.coaches || team.coaches.length === 0) {
      throw new Error(`Team ${team.name} has no coaches, cannot draft.`);
    }

    team.draft.push({
      pokemonId: pokemonId,
      picker: team.coaches[0]._id,
      timestamp: new Date(),
    });

    if (team.picks.length > 0) {
      team.picks.shift();
    }

    team.picks = team.picks.map((round) =>
      round.filter((p) => p !== pokemonId)
    );

    await team.save({ session });

    const teamIndex = (division.teams as LeagueTeamDocument[]).findIndex(
      (t) => t.id === team.id
    );
    if (teamIndex !== -1) {
      (division.teams as LeagueTeamDocument[])[teamIndex] = team;
    }

    const tier = await getPokemonTier(league._id, pokemonId);

    const snipeCount = await removePokemonFromPicks(
      division,
      pokemonId,
      session,
      team.id
    );

    const numberOfRounds = (league.tierList as DraftTierListDocument)
      .draftCount[1];
    const initialTeamOrder = division.teams as LeagueTeamDocument[];

    const pickOrder = generatePickOrder(
      initialTeamOrder,
      numberOfRounds,
      division.draftStyle
    );
    const canDraftTeams = calculateCanDraft(division, pickOrder);
    const pokemonName = getName(pokemonId);

    const pokemonTierMap = createPokemonTierMap(league);

    const draft = await Promise.all(
      team.draft.map(async (pick) => ({
        id: pick.pokemonId,
        name: getName(pick.pokemonId),
        tier: pokemonTierMap.get(pick.pokemonId),
      }))
    );
    eventEmitter.emit("draft.added", {
      leagueId: league.leagueKey,
      divisionId: division.divisionKey,
      pick: {
        pokemon: {
          id: pokemonId,
          name: pokemonName,
          tier,
        },
        team: {
          id: team.id,
          name: team.name,
        },
        division: division.name,
      },
      canDraftTeams,
      team: {
        id: team.id,
        name: team.name,
        draft,
      },
      currentPick: calculateCurrentPick(division),
    });

    if (division.channelId) {
      const pokemon = {
        name: pokemonName,
        id: pokemonId,
      };

      await team.populate<{
        coaches: LeagueUserDocument[];
      }>({
        path: "coaches",
        model: "LeagueUser",
      });

      const messageContent = `${pokemon.name} was drafted by <@${
        (team.coaches[0] as LeagueUserDocument)?.discordId
      }>.`;

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
          title: `${team.name} drafted ${pokemon.name}!`,
          url: `https://pokemondraftzone.com/leagues/pdbls2/${division.divisionKey}/draft`,
          fields,
          image: `https://play.pokemonshowdown.com/sprites/gen5/${pokemon.name.toLowerCase()}.png`,
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
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument
): Promise<boolean> {
  await league.populate<{
    tierList: DraftTierListDocument;
  }>("tierList");

  const tierList = league.tierList as DraftTierListDocument;
  if (team.draft.length >= tierList.draftCount[1]) return true;
  const teamPoints = await getTeamPoints(league, team);
  if (teamPoints >= tierList.points) return true;
  return false;
}
export async function increaseCounter(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  session?: ClientSession
) {
  try {
    division.draftCounter++;

    await cancelSkipPick(division);
    await scheduleSkipPick(league, division);
    const nextTeam = getCurrentPickingTeam(division);
    //BREAKGLASS: make this always false
    if (await isTeamDoneDrafting(league, division, nextTeam)) {
      return increaseCounter(league, division, session);
    }
    await nextTeam.populate<{
      coaches: LeagueUserDocument[];
    }>({
      path: "coaches",
      model: "LeagueUser",
    });
    const nextTeamPicks = await currentTeamPicks(league, division, nextTeam);
    if (nextTeamPicks) {
      await draftPokemon(
        league,
        division,
        getCurrentPickingTeam(division),
        nextTeamPicks[0],
        session
      );
    } else {
      const numberOfRounds = (league.tierList as DraftTierListDocument)
        .draftCount[1];
      const initialTeamOrder = division.teams as LeagueTeamDocument[];
      const pickOrder = generatePickOrder(
        initialTeamOrder,
        numberOfRounds,
        division.draftStyle
      );
      eventEmitter.emit("draft.counter", {
        leagueId: league.leagueKey,
        divisionId: division.divisionKey,
        currentPick: calculateCurrentPick(division),
        nextTeam: nextTeam._id.toString(),
        canDraftTeams: calculateCanDraft(division, pickOrder),
      });

      if (division.channelId) {
        sendDiscordMessage(
          division.channelId,

          `<@${
            (nextTeam.coaches[0] as LeagueUserDocument).discordId
          }>, it is now your turn!`
        );
      }
    }

    await division.save({ session });
  } catch (error) {
    console.error("Error in increaseCounter:", error);
    throw error;
  }
}

export async function checkCounterIncrease(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  session?: ClientSession
) {
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length
  );
  const currentPickingTeam = getCurrentPickingTeam(division);
  if (
    currentPickingTeam._id.equals(team._id) &&
    currentPickingTeam.draft.length >= currentRound
  ) {
    await increaseCounter(league, division, session);
  }
}

export async function getDivisionDetails(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  userId: string
) {
  const numberOfRounds = (league.tierList as DraftTierListDocument)
    .draftCount[1];
  const initialTeamOrder = division.teams as LeagueTeamDocument[];

  const pickOrder = generatePickOrder(
    initialTeamOrder,
    numberOfRounds,
    division.draftStyle
  );

  await division.populate<{
    teams: (LeagueTeamDocument & { coaches: LeagueUserDocument[] })[];
  }>({
    path: "teams",
    populate: {
      path: "coaches",
      model: "LeagueUser",
    },
  });

  const teams = await getTeamsWithCoachStatus(
    division,
    league,
    userId,
    numberOfRounds
  );

  const canDraft = calculateCanDraft(division, pickOrder);
  const currentPick = calculateCurrentPick(division);

  await league.populate<{
    tierList: DraftTierListDocument;
  }>("tierList");

  const tierList = league.tierList as DraftTierListDocument;

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
    points: tierList.points,
  };
}

export async function skipCurrentPick(
  league: LeagueDocument,
  division: LeagueDivisionDocument
) {
  const team = getCurrentPickingTeam(division);
  console.log({ division, team });
  eventEmitter.emit("league.draft.skip", {
    leagueId: league.leagueKey,
    divisionId: division.divisionKey,
    teamName: team.name,
  });

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
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  state: string
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
      leagueId: league.leagueKey,
      divisionId: division.divisionKey,
      status: division.status,
      currentPick: calculateCurrentPick(division),
    });
  }
}

async function removePokemonFromPicks(
  division: LeagueDivisionDocument,
  pokemonId: string,
  session?: ClientSession,
  skipTeamId?: string
) {
  let teamsToProcess = division.teams as LeagueTeamDocument[];
  if (skipTeamId) {
    teamsToProcess = teamsToProcess.filter((team) => team.id !== skipTeamId);
  }

  const teamsWithPick = teamsToProcess.filter((team) =>
    team.picks.some((round) => round.includes(pokemonId))
  );

  if (teamsWithPick.length > 0) {
    await Promise.all(
      teamsWithPick.map((team) => {
        team.picks = team.picks.map((round) =>
          round.filter((p) => p !== pokemonId)
        );
        return team.save({ session });
      })
    );
  }

  return teamsWithPick.length;
}
