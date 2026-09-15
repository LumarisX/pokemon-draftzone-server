import { ModData } from "@pkmn/dex";
import { VendoredSource } from "../ps-source";
import * as ZA from "./za";

export const LEGENDS_ZA_DATA = {
  Scripts: { gen: 9 },
  Species: ZA.Pokedex,
  Learnsets: ZA.Learnsets,
} as unknown as ModData;

export const LEGENDS_ZA_NATIVE_SPECIES: ReadonlySet<string> = new Set(
  Object.entries(ZA.FormatsData as Record<string, { isNonstandard?: unknown }>)
    .filter(([, entry]) => entry?.isNonstandard === null)
    .map(([id]) => id),
);

export const LEGENDS_ZA_SOURCE: VendoredSource = ZA.SOURCE;
