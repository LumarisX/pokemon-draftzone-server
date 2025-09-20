import eventEmitter from "../../event-emitter";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import { LeagueDocument } from "../../models/league/league.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import { DraftTierListDocument } from "../../models/league/tier-list.model";
import { LeagueUserDocument } from "../../models/league/user.model";
import { getName } from "../data-services/pokedex.service";
import { getPokemonTier } from "./tier-service";

export type DraftPick = {
  teamName: string;
  pokemon?: { id: string; name: string };
};

export type DraftRound = DraftPick[];

export type TeamWithCoachStatus = {
  id: string;
  name: string;
  draft: { id: string; name: string; tier: string | undefined }[];
  logoUrl?: string;
  isCoach: boolean;
  picks: { id: string; name: string; tier: string | undefined }[][];
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
        logoUrl: team.logoUrl,
        isCoach,
        picks,
        pointTotal,
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
  const teamMap = new Map(initialTeamOrder.map((t) => [t.id, t]));

  // Calculate how many picks each team should have made
  const picksExpected = new Map<string, number>();
  for (let i = 0; i < division.draftCounter; i++) {
    const teamId = pickOrder[i].id;
    picksExpected.set(teamId, (picksExpected.get(teamId) || 0) + 1);
  }

  // Add teams that have missed picks
  for (const team of initialTeamOrder) {
    const expected = picksExpected.get(team.id) || 0;
    if (team.draft.length < expected) {
      canDraft.push(team.id);
    }
  }

  // Add the current picker
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

  return !(team.coaches as LeagueUserDocument[]).some((c) => c.auth0Id === sub);
}

export function getCurrentPickingTeam(division: LeagueDivisionDocument) {
  const teams = division.teams as LeagueTeamDocument[];
  const teamsCount = teams.length;
  const currentRound = Math.floor(division.draftCounter / teamsCount);
  const currentPositionInRound = division.draftCounter % teamsCount;

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
  console.log({
    pickCount,
    teamSize,
    currentRound,
    currentPositionInRound,
    teamIndexInPickingOrder,
  });
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

export function currentTeamPick(
  division: LeagueDivisionDocument
): string | null {
  const team = getCurrentPickingTeam(division);
  const picks = team.picks[0].filter((pick) => pick.trim());
  if (!picks.length) return null;
  return picks[0];
}

export async function increaseCounter(
  league: LeagueDocument,
  division: LeagueDivisionDocument
) {
  console.log("INCREASING DRAFT COUNTER");
  division.draftCounter++;

  const numberOfRounds = (league.tierList as DraftTierListDocument)
    .draftCount[1];
  const initialTeamOrder = division.teams as LeagueTeamDocument[];

  const pickOrder = generatePickOrder(
    initialTeamOrder,
    numberOfRounds,
    division.draftStyle
  );

  const nextTeamPick = currentTeamPick(division);

  if (nextTeamPick) {
    await draftPokemon(
      league,
      division,
      getCurrentPickingTeam(division),
      nextTeamPick
    );
  } else {
    eventEmitter.emit("draft.counter", {
      leagueId: league.leagueKey,
      division: division.name,
      currentPick: calculateCurrentPick(division),
      nextTeam: getCurrentPickingTeam(division)._id.toString(),
      canDraftTeams: calculateCanDraft(division, pickOrder),
    });
  }

  const now = new Date();
  now.setSeconds(now.getSeconds() + division.timerLength);
  division.skipTime = now;

  await division.save();
}

export async function checkCounterIncrease(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument
) {
  const currentRound = Math.floor(
    division.draftCounter / division.teams.length
  );
  const currentPickingTeam = getCurrentPickingTeam(division);
  if (
    currentPickingTeam._id.equals(team._id) &&
    currentPickingTeam.draft.length >= currentRound
  ) {
    await increaseCounter(league, division);
  }
}

export async function draftPokemon(
  league: LeagueDocument,
  division: LeagueDivisionDocument,
  team: LeagueTeamDocument,
  pokemonId: string
) {
  if (!(await canTeamDraft(division, team))) {
    throw new Error("It is not this team's turn to draft.");
    // return res
    //   .status(403)
    //   .json({ message: "It is not this team's turn to draft." });
  }

  if (isAlreadyDrafted(division, pokemonId)) {
    throw new Error("Pokemon has already been drafted.");
    // return res
    //   .status(409)
    //   .json({ message: "Pokemon has already been drafted." });
  }

  team.draft.push({
    pokemonId: pokemonId,
    picker: team.coaches[0]._id,
    timestamp: new Date(),
  });

  team.picks.shift();

  await team.save();

  const tier = await getPokemonTier(league._id, pokemonId);

  eventEmitter.emit("draft.added", {
    leagueId: league.leagueKey,

    pick: {
      pokemon: {
        id: pokemonId,
        name: getName(pokemonId),
        tier,
      },
      team: {
        id: team.id,
        name: team.name,
      },
      division: division.name,
    },
  });

  await checkCounterIncrease(league, division, team);
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

export function skipCurrentPick(
  league: LeagueDocument,
  division: LeagueDivisionDocument
) {
  eventEmitter.emit("draft.skip", {
    leagueId: league.leagueKey,
    data: {
      division: division.name,
    },
  });

  increaseCounter(league, division);
}
