import {
  ApplicationCommandDataResolvable,
  AutocompleteInteraction,
  CommandInteraction,
} from "discord.js";
// import { DraftRoute } from "./draft/draft.router";

type CommandData = {
  name: string;
  toJSON: () => ApplicationCommandDataResolvable;
};

export type Command = {
  data: CommandData;
  execute: (interaction: CommandInteraction) => void | Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => void | Promise<void>;
};

export type CommandRoute = {
  commands: { command: Command; enabled?: boolean }[];
  enabled?: boolean;
};

// export let routes: CommandRoute[] = [DraftRoute];
export let routes: CommandRoute[] = [];
