import { CoachDocument } from "@modules/coach/coach.schema";
import { getName, getSpecies } from "@modules/data/domain/pokedex";
import {
  PopulatedDraft,
  PopulatedTeam,
  PopulatedTournament,
} from "@modules/draft/draft.repository";
import { TypeName } from "@pkmn/data";
import {
  calculateCanDraft,
  calculateCanDraftCounts,
  calculateCurrentPick,
  generatePickOrder,
  getDraftOrder,
  getPokemonIdFromDraft,
} from "./pick-order";
import { createPokemonTierMap, getPickCost } from "./tier-cost";

export type TeamWithCoachStatus = {
  id: string;
  name: string;
  draft: {
    id: string;
    name: string;
    tier: string | undefined;
    cost: number;
    types: TypeName[];
    capt: { tera: boolean | undefined };
  }[];
  logo?: string;
  isCoach: boolean;
  picks: {
    id: string;
    name: string;
    tier: string | undefined;
    cost: number;
    addons: string[] | undefined;
  }[][];
  pointTotal: number;
  timezone?: string;
  skipCount: number;
};

export async function getTeamsWithCoachStatus(
  draft: PopulatedDraft,
  tournament: PopulatedTournament,
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

export async function isCoach(
  team: PopulatedTeam,
  sub: string,
): Promise<boolean> {
  await team.populate<{ coach: CoachDocument }>("coach");

  return team.coach.auth0Id === sub;
}

export async function getDraftDetails(
  tournament: PopulatedTournament,
  draft: PopulatedDraft,
  userId: string,
) {
  const numberOfRounds = tournament.draftCount.max;
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
  const canDraftCounts = calculateCanDraftCounts(draft, pickOrder);
  const currentPick = calculateCurrentPick(draft);

  return {
    leagueName: tournament.name,
    draftName: draft.name,
    orderProgression: draft.orderProgression,
    sequentialTurns: draft.sequentialTurns,
    visibility: draft.visibility,
    allowRemovals: draft.allowRemovals,
    teamOrder: initialTeamOrder.map((team) => team._id),
    rounds: numberOfRounds,
    minDraftCount: tournament.draftCount.min,
    teams: teams,
    currentPick,
    skipTime: draft.skipTime,
    status: draft.status,
    canDraft,
    canDraftCounts,
    points: tournament.pointTotal,
    logo: tournament.logo,
  };
}
