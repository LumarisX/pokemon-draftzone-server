import { ModData } from "@pkmn/dex";
import * as Substrate from "@pkmn/mods/champions";
import * as MA from "./ma";
import * as MB from "./mb";
import * as MC from "./mc";
import { VendoredSource } from "../ps-source";

export type ChampionsRegulation = "M-A" | "M-B" | "M-C";

type Table = Record<string, unknown> | undefined;

const layer = (base: Table, over: Table): Table =>
  over ? { ...base, ...over } : base;

const mc = {
  ...(Substrate as unknown as Record<string, unknown>),
  FormatsData: MC.FormatsData,
  Learnsets: MC.Learnsets,
  Items: MC.Items,
  Moves: MC.Moves,
};

const mb = {
  ...mc,
  FormatsData: MB.FormatsData,
  Learnsets: layer(MC.Learnsets as Table, MB.Learnsets as Table),
  Items: layer(MC.Items as Table, MB.Items as Table),
  Moves: layer(MC.Moves as Table, MB.Moves as Table),
};

const ma = {
  ...mb,
  FormatsData: MA.FormatsData,
  Items: layer(mb.Items as Table, MA.Items as Table),
  Moves: layer(mb.Moves as Table, MA.Moves as Table),
};

export const CHAMPIONS_REGULATION_DATA: Record<ChampionsRegulation, ModData> = {
  "M-A": ma as unknown as ModData,
  "M-B": mb as unknown as ModData,
  "M-C": mc as unknown as ModData,
};

export const CHAMPIONS_REGULATION_SOURCES: Record<
  ChampionsRegulation,
  VendoredSource
> = {
  "M-A": MA.SOURCE,
  "M-B": MB.SOURCE,
  "M-C": MC.SOURCE,
};
