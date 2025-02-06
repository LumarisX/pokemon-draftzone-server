import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SharedSlashCommand,
} from "discord.js";
import { DraftRoute } from "./draft/draft.router";

export type Command = {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => void;
  autocomplete?: (interaction: AutocompleteInteraction) => void;
};

export type CommandRoute = {
  commands: { command: Command; enabled?: boolean }[];
  enabled?: boolean;
};

export let routes: CommandRoute[] = [DraftRoute];
