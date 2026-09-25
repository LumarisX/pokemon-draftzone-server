import { canOnTeam } from "@modules/tournament/membership";
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
  getDocumentId,
  getDraftOrder,
  getPokemonIdFromDraft,
} from "./pick-order";
import {
  canSeeAllPicks,
  canSeeTeamPicks,
  picksAreBlind,
} from "./pick-visibility";
import {
  createPokemonTierMap,
  enforceableTierRequirements,
  getPickCost,
} from "./tier-cost";

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
    draftFormes: { id: string; name: string }[] | undefined;
    picker: string | undefined;
    timestamp: Date | undefined;
  }[];
  logo?: string;
  coach: string;
  isCoach: boolean;
  picks: {
    id: string;
    name: string;
    tier: string | undefined;
    cost: number;
    addons: string[] | undefined;
    draftFormes: { id: string; name: string }[] | undefined;
  }[][];
  pointTotal: number;
  timezone?: string;
  skipCount: number;
  picksHidden: boolean;
  pickCount: number;
};

export async function getTeamsWithCoachStatus(
  draft: PopulatedDraft,
  tournament: PopulatedTournament,
  userId: string,
  numberOfRounds: number,
): Promise<TeamWithCoachStatus[]> {
  const pokemonTierMap = createPokemonTierMap(tournament);
  const coachNames = new Map<string, string>(
    draft.teams
      .flatMap((team: PopulatedTeam) => team.coaches ?? [])
      .filter((coach) => !!coach?._id)
      .map((coach) => [coach._id.toString(), coach.name] as const),
  );

  const teams = await Promise.all(
    draft.teams.map(async (team: PopulatedTeam) => {
      const isCoach = canOnTeam(team, userId, "draft");
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
                  draftFormes: tierList.getPokemonFormes(pick.pokemonId),
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
            draftFormes: tierList.getPokemonFormes(pokemonId),
            picker: pick.picker
              ? coachNames.get(getDocumentId(pick.picker))
              : undefined,
            timestamp: pick.timestamp,
          };
        }),
      );

      const pointTotal = draftPicks
        .filter((pokemon) => pokemon.tier)
        .reduce((total, pokemon) => total + (pokemon.cost || 0), 0);

      const coach = team.primaryCoach;
      const picksHidden = !canSeeTeamPicks(tournament, draft, team, userId);

      return {
        id: team._id.toString(),
        name: team.teamName,
        draft: picksHidden ? [] : draftPicks,
        logo: team.logo,
        coach: coach?.name ?? "",
        isCoach,
        picks,
        pointTotal: picksHidden ? 0 : pointTotal,
        timezone: coach.timezone,
        skipCount: team.skipCount || 0,
        picksHidden,
        pickCount: team.pickLog.length,
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
  await team.populate<{ coaches: CoachDocument[] }>("coaches");

  return canOnTeam(team, sub, "draft");
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
    picksVisibleTo: draft.picksVisibleTo,
    allowDuplicates: draft.allowDuplicates,
    picksBlind: picksAreBlind(draft),
    canSeeAllPicks: canSeeAllPicks(tournament, draft, userId),
    allowRemovals: draft.allowRemovals,
    teamOrder: initialTeamOrder.map((team) => team._id),
    useRandomSeeding: draft.useRandomSeeding,
    channelId: draft.channelId,
    rounds: numberOfRounds,
    minDraftCount: tournament.draftCount.min,
    tierRequirements: enforceableTierRequirements(tournament).map(
      (requirement) => ({
        tierId: requirement.tierId,
        tierName:
          tournament.tierList.getTierById(requirement.tierId)?.name ?? "",
        required: requirement.required,
      }),
    ),
    teams: teams,
    currentPick,
    skipTime: draft.skipTime,
    status: draft.status,
    noTimer: draft.noTimer,
    timerLength: draft.timerLength,
    public: draft.public,
    draftStart: draft.draftStart,
    draftEnd: draft.draftEnd,
    canDraft,
    canDraftCounts,
    points: tournament.pointTotal,
    logo: tournament.logo,
  };
}
