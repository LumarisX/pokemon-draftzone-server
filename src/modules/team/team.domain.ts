import { isOwnedBy } from "@modules/coach/coach.domain";
import { PopulatedTeam } from "./team.repository";

export function getDraftedPokemonIds(team: PopulatedTeam): string[] {
  return team.pickLog.map((pick) => pick.pokemon.id);
}

export function isCoachedBy(team: PopulatedTeam, sub: string | undefined): boolean {
  return isOwnedBy(team.coach, sub);
}
