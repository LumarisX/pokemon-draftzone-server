import { Generation, TypeName } from "@pkmn/data";

export function damageTaken(gen: Generation, type: string[]) {
  return gen.dex.types.get(type[0]).damageTaken;
}
