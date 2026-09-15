import { ModdedDex } from "@pkmn/sim";

export type { Pokemon } from "@pkmn/sim";

export type Move = ReturnType<ModdedDex["moves"]["get"]>;

export type ActiveMove = Parameters<
  NonNullable<Move["basePowerCallback"]>
>[2];
