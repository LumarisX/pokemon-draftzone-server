import { PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { guildCheck } from "..";
import { Command } from "../..";
import { getDetails, getDivisions, setDrafted } from "../../../../data/pdbl";

export const DraftModPickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("mod-setdrafted")
    .setDescription("Admin only: Choose a draft pick a user.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption((option) =>
      option
        .setName("division")
        .setDescription("Division")
        .setRequired(true)
        .addChoices(
          getDivisions().map((division) => ({
            name: division,
            value: division,
          }))
        )
    )
    .addStringOption((option) =>
      option
        .setName("pokemon")
        .setDescription("Pokemon")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option.setName("drafted").setDescription("Mark as drafted?")
    ),
  execute: async (interaction) => {
    if (!guildCheck(interaction.guildId))
      throw new Error("Server does not have a registered draft.");
    let divisionString = interaction.options.getString("division");
    const set = interaction.options.getBoolean("drafted") ?? true;
    const pokemon = interaction.options.getString("pokemon", true);
    try {
      setDrafted(pokemon, divisionString, set);
      interaction.reply({
        content: `Division: ${divisionString}, Pokemon: ${pokemon}, Drafted: ${set}`,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.log(error);
        return interaction.reply({
          content: error.message,
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: "There was an error.",
        ephemeral: true,
      });
    }
  },
  autocomplete: async (interaction) => {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const choices = getDetails()
      .pokemons.sort((a, b) => a.specie.name.localeCompare(b.specie.name))
      .map((mon) => ({
        name: mon.specie.name,
        value: mon.specie.id,
      }));

    const filtered = choices
      .filter((mon) => mon.name.toLowerCase().startsWith(focusedValue))
      .slice(0, 25);
    await interaction.respond(filtered);
  },
};
