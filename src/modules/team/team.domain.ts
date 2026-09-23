import { Capability, canOnTeam } from "@modules/tournament/membership";
import { PopulatedTeam } from "./team.repository";

export function getDraftedPokemonIds(team: PopulatedTeam): string[] {
  return team.pickLog.map((pick) => pick.pokemon.id);
}

export function isCoachedBy(
  team: PopulatedTeam,
  sub: string | undefined,
  capability: Capability,
): boolean {
  return canOnTeam(team, sub, capability);
}
