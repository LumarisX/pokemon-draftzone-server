// import {
//   AttachmentBuilder,
//   ChatInputCommandInteraction,
//   TextBasedChannel,
//   User,
// } from "discord.js";
// import fs from "fs";
// import path from "path";
// import { DexData, getDexData } from "./data/draftdex";
// import { Timer } from "./timer";

// export const filePath = path.resolve(__dirname, "./draft.json");

// export type PokemonData = {
//   pid: string;
//   tier: string;
//   category: string;
//   note?: string;
// };
// export type CoachData = {
//   username: string;
//   id: string;
//   order: number;
//   tradesLeft: [string[], number][];
//   team: ({ pokemon: PokemonData; order: number } | null)[];
//   leftPicks: PokemonData[];
// };
// export type DivisionData = {
//   channels: string[];
//   coaches: CoachData[];
//   name: string;
//   draftCount: number;
//   timer: undefined | Timer;
// };
// export type Draft = {
//   categories: string[];
//   tiers: { name: string; max: number }[];
//   divisions: DivisionData[];
//   state: "" | "started" | "paused" | "ended";
//   timerMinutes: number;
//   reminders: number[];
//   pokemon: PokemonData[];
// };

// export let draftData: Draft = readDraftData();

// function getRandomPokemon(
//   division: DivisionData,
//   tier: string,
//   category: string
// ) {
//   let undrafted = getUndrafted(division, {
//     tier: tier,
//     category: category,
//   });
//   if (undrafted.length > 0) {
//     return undrafted[Math.floor(Math.random() * undrafted.length)];
//   } else {
//     throw new Error(
//       `No Pokémon are left in tier: ${tier}, category: ${category}. Please choose again.`
//     );
//   }
// }

// export function isDrafted(pid: string, division: DivisionData) {
//   return division.coaches.find((coach) =>
//     coach.team.some((pick) => pick && pick.pokemon.pid === pid)
//   );
// }

// export async function draftPokemon(
//   division: DivisionData,
//   user: User,
//   pokemon: PokemonData,
//   interaction: ChatInputCommandInteraction,
//   options: { validate?: true; order?: number } = {}
// ) {
//   let coach = getCoach(division, user.id);
//   if (!coach) {
//     throw new Error("You are not a coach in this division.");
//   }
//   if (isDrafted(pokemon.pid, division)) {
//     throw new Error("Already drafted.");
//   }
//   if (options.validate && !validDraftPick(division, user, pokemon)) {
//     throw new Error("Illegal pick. Please choose again.");
//   }
//   division.timer = division.timer?.end();
//   coach.team.push({
//     order: options.order ? options.order : division.draftCount,
//     pokemon: pokemon,
//   });
//   writeDraft();
//   let channel = await interaction.client.channels.fetch(division.channels[0]);
//   if (!channel?.isTextBased()) throw new Error("Channel error.");
//   let dex = getDexData(pokemon.pid)!;
//   const attachment = new AttachmentBuilder(
//     `https://play.pokemonshowdown.com/sprites/gen5/${dex.png}.png`,
//     { name: `${dex.png}.png` }
//   );
//   channel.send({
//     content: `${dex.name} was drafted!`,
//     files: [attachment],
//   });
//   advanceDraft(channel);
//   return pokemon;
// }

// export async function draftRandom(
//   division: DivisionData,
//   user: User,
//   tier: string,
//   category: string,
//   interaction: ChatInputCommandInteraction,
//   options: { validate?: true }
// ) {
//   const randomMon = getRandomPokemon(
//     division,
//     tier as string,
//     category as string
//   );
//   if (!randomMon) return null;
//   let channel = await interaction.client.channels.fetch(division.channels[0]);
//   if (!channel?.isTextBased()) return null;
//   let baseString = `${user} has selected a ${tier}-tier ${category} pokemon.`;
//   channel.send(baseString);
//   return draftPokemon(division, user, randomMon, interaction, {
//     validate: options.validate,
//   });
// }

// export function undoDraft(division: DivisionData) {
//   let coach = division.coaches.find((coach) =>
//     coach.team.some((pick) => pick?.order === division.draftCount - 1)
//   );
//   if (!coach) return;
//   for (let i in coach.team) {
//     if (coach.team[i] && coach.team[i].order === division.draftCount - 1) {
//       coach.team[i] = null;
//     }
//   }
//   division.draftCount--;
//   division.timer?.end();
//   division.timer = undefined;
//   writeDraft();
//   return coach;
// }

// export function getNextCoach(division: DivisionData): CoachData {
//   let reverse = Math.floor(division.draftCount / division.coaches.length) % 2;
//   if (reverse) {
//     return division.coaches[
//       division.coaches.length -
//         (division.draftCount % division.coaches.length) -
//         1
//     ];
//   }
//   return division.coaches[division.draftCount % division.coaches.length];
// }

// export function readDraftData(): Draft {
//   return JSON.parse(fs.readFileSync(filePath, "utf-8"));
// }

// export function getUndrafted(
//   division: DivisionData,
//   options: { tier?: string | null; category?: string | null } = {}
// ) {
//   let undraftedData = draftData.pokemon.filter(
//     (pokemon) =>
//       !isDrafted(pokemon.pid, division) &&
//       (!options.tier ||
//         pokemon.tier.toLowerCase() === options.tier.toLowerCase()) &&
//       (!options.category ||
//         pokemon.category.toLowerCase() === options.category.toLowerCase())
//   );
//   return undraftedData;
// }

// export function getDrafted(
//   division: DivisionData,
//   options: { tier?: string; category?: string; user?: string } = {}
// ): (DexData & PokemonData)[] {
//   let draftedData = division.coaches
//     .filter((coach) => !options.user || options.user === coach.username)
//     .flatMap((coach) => coach.team)
//     .filter((pick) => pick != null)
//     .map((pick) => pick.pokemon);

//   if (options.tier) {
//     draftedData = draftedData.filter(
//       (pokemon) => pokemon.tier === options.tier
//     );
//   }
//   if (options.category) {
//     draftedData = draftedData.filter(
//       (pokemon) => pokemon.category === options.category
//     );
//   }

//   return draftedData.map((pokemon) => {
//     let dex = getDexData(pokemon.pid)!;
//     return {
//       pid: pokemon.pid,
//       png: dex.png,
//       note: pokemon.note,
//       name: dex.name,
//       tier: pokemon.tier,
//       category: pokemon.category,
//     };
//   });
// }

// export function resetDraft() {
//   draftData.divisions.forEach((division) => {
//     division.draftCount = 0;
//     division.coaches.forEach((coach) => (coach.team = []));
//   });
//   draftData.state = "";
//   writeDraft();
// }

// function writeDraft() {
//   fs.writeFileSync(
//     filePath,
//     JSON.stringify(
//       {
//         categories: draftData.categories,
//         tiers: draftData.tiers,
//         divisions: draftData.divisions.map((division) => ({
//           channels: division.channels,
//           coaches: division.coaches,
//           name: division.name,
//           draftCount: division.draftCount,
//         })),
//         state: draftData.state,
//         timerMinutes: draftData.timerMinutes,
//         reminders: draftData.reminders,
//         pokemon: draftData.pokemon,
//       },
//       null,
//       2
//     )
//   );
// }

// export function getDraftData(query: string): PokemonData | undefined {
//   return draftData.pokemon.find((pokemon) => pokemon.pid === query);
// }

// export function tradeRandom(
//   division: DivisionData,
//   oldPokemon: DexData,
//   category: string,
//   coach: CoachData,
//   user: User,
//   channel: TextBasedChannel,
//   options: { validate?: boolean }
// ) {
//   let oldPokemonDraft = getDraftData(oldPokemon.pid);
//   if (!oldPokemonDraft) {
//     throw new Error(`Unknown pokemon, ${oldPokemon.pid}.`);
//   }
//   let newPokemon = getRandomPokemon(division, oldPokemonDraft.tier, category);
//   if (!newPokemon) return null;
//   channel.send({
//     content: `${user} rerolled for a new ${oldPokemonDraft.tier}-tier ${category} pokemon!`,
//   });
//   trade(division, oldPokemon, newPokemon, coach, user, channel, options);
// }

// export async function trade(
//   division: DivisionData,
//   oldPokemonDex: DexData,
//   newPokemon: PokemonData,
//   coach: CoachData,
//   user: User,
//   channel: TextBasedChannel,
//   options: { validate?: boolean }
// ): Promise<DexData | string> {
//   if (!oldPokemonDex || !newPokemon) return `Invalid Pokemon.`;
//   let tradeIndex = coach.team.findIndex(
//     (pick) => pick && pick.pokemon.pid === oldPokemonDex.pid
//   );
//   if (tradeIndex < 0)
//     return `${coach.username} does not have ${oldPokemonDex.name} drafted.`;
//   if (isDrafted(newPokemon.pid, division)) return `Already drafted.`;
//   if (
//     options.validate &&
//     newPokemon.tier !== coach.team[tradeIndex]!.pokemon.tier
//   )
//     return `Trades must be the same tier.`;
//   let newPokemonDex = getDexData(newPokemon.pid)!;
//   const attachment = new AttachmentBuilder(
//     `https://play.pokemonshowdown.com/sprites/gen5/${newPokemonDex.png}.png`,
//     { name: `${newPokemonDex.png}.png` }
//   );
//   const tradeArray = coach.tradesLeft.find((value) =>
//     value[0].includes(newPokemon.tier)
//   );
//   if (!tradeArray || tradeArray[1] <= 0) throw new Error("No trades are left.");
//   tradeArray[1]--;
//   if (coach)
//     channel.send({
//       content: `${user} traded ${oldPokemonDex.name} for ${newPokemonDex.name}! (${tradeArray[1]} remaining)`,
//       files: [attachment],
//     });
//   coach.team[tradeIndex]!.pokemon = newPokemon;
//   writeDraft();
//   return newPokemonDex;
// }

// export async function updateState(
//   state: "start" | "end" | "pause" | "resume",
//   interaction: ChatInputCommandInteraction
// ) {
//   if (state === "start") {
//     if (draftData.state !== "")
//       throw new Error("Draft has already been started.");
//     draftData.state = "started";
//   } else if (state === "end") {
//     if (draftData.state === "") throw new Error("Draft has not been started.");
//     if (draftData.state === "ended") throw new Error("Draft already ended");
//     draftData.state = "ended";
//   } else if (state === "pause") {
//     if (draftData.state !== "started")
//       throw new Error("Draft can not be paused.");
//     draftData.state = "paused";
//   } else if (state === "resume") {
//     if (draftData.state !== "paused") {
//       throw new Error("Draft is not paused.");
//     }
//     draftData.state = "started";
//   }
//   for (let division of draftData.divisions) {
//     let channel = await interaction.client.channels.fetch(division.channels[0]);
//     if (!channel?.isTextBased()) return;
//     if (state === "start") {
//       channel.send("The draft has been started!");
//       notifyNext(channel);
//     } else if (state === "end") {
//       channel.send("Draft has ended.");
//     } else if (state === "pause") {
//       division.timer?.pause();
//       channel.send("Draft has been paused.");
//     } else if (state === "resume") {
//       channel.send("Draft has been resumed.");
//       notifyNext(channel);
//       division.timer?.start();
//     }
//   }
//   writeDraft();
//   return interaction.reply({
//     content: `Draft state was changed to ${state}.`,
//     ephemeral: true,
//   });
// }

// export function getCoach(division: DivisionData, userId: string) {
//   return division.coaches.find((user) => user.id === userId);
// }

// export function canDraft(division: DivisionData, userId: string): boolean {
//   let user = getCoach(division, userId);
//   if (!user) throw new Error("User is not a coach in this division.");
//   let userIndex = division.coaches.indexOf(user);
//   if (userIndex < 0) throw new Error("User is not a coach in this division.");
//   let orderLength = division.coaches.length;
//   let draftTotal = Math.floor(division.draftCount / orderLength);
//   let reverse = draftTotal % 2;
//   console.log(orderLength, draftTotal, division.draftCount, userIndex, reverse);
//   if (reverse) {
//     if (userIndex <= orderLength - (division.draftCount % orderLength))
//       return false;
//   } else {
//     if ((userIndex = division.draftCount % orderLength)) return false;
//   }
//   draftTotal++;
//   return getDrafted(division, { user: user.username }).length < draftTotal;
// }
// export function validDraftPick(
//   division: DivisionData,
//   user: User,
//   pokemonData: PokemonData
// ): boolean {
//   let max = draftData.tiers.find(
//     (tierData) => tierData.name === pokemonData.tier
//   )?.max;
//   if (!max) return false;
//   return (
//     getDrafted(division, { tier: pokemonData.tier, user: user.username })
//       .length < max
//   );
// }

// export function notifyNext(channel: TextBasedChannel | null) {
//   if (!channel) return;
//   setTimeout(async () => {
//     let division = getDivisionByChannel(channel.id);
//     if (!division) return;
//     let nextUser = await channel.client.users.fetch(getNextCoach(division).id);
//     if (!division.timer) {
//       division.timer = new Timer(
//         draftData.timerMinutes,
//         draftData.reminders,
//         (remainingMinutes: number) => {
//           channel.send(`${nextUser} ${remainingMinutes} minutes left!`);
//         },
//         () => {
//           skipUser(channel);
//         }
//       );
//       if (nextUser.displayName.toLowerCase() === "keith") {
//         division.timer.reminders = [
//           1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
//           21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
//           38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
//           55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
//           72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
//           89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
//           105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
//           119,
//         ];
//       }
//       if (draftData.state == "started") {
//         division.timer.start();
//       }
//     }
//     let hours = Math.floor(division.timer.remainingMinutes / 60);
//     let minutes = division.timer.remainingMinutes % 60;
//     channel.send(
//       `${nextUser} you're up next! You have ` +
//         (hours > 1 ? `${hours} hours ` : "") +
//         (hours === 1 ? `${hours} hour ` : "") +
//         (hours > 0 && minutes > 0 ? `and ` : "") +
//         (minutes > 1 ? `${minutes} minutes ` : "") +
//         (minutes === 1 ? `${minutes} minute ` : "") +
//         (draftData.state === "paused" ? `(currently paused) ` : "") +
//         `to make your pick.`
//     );
//   }, 1000);
// }

// export async function skipUser(
//   channel: TextBasedChannel,
//   division?: DivisionData
// ) {
//   if (!division) division = getDivisionByChannel(channel.id);
//   if (!division) return;
//   let skippedUser = await channel.client.users.fetch(getNextCoach(division).id);
//   channel.send(`${skippedUser} was skipped.`);
//   advanceDraft(channel);
// }

// export function getDivisionByChannel(
//   channelID: string | null
// ): DivisionData | undefined {
//   if (!channelID) return;
//   let division = draftData.divisions.find((division) =>
//     division.channels.includes(channelID)
//   );
//   return division;
// }

// export function getDivisionByName(name: string) {
//   if (!name) throw new Error(`Division not found`);
//   let division = draftData.divisions.find((division) => division.name === name);
//   return division;
// }

// export function isNextPick(user: User, division: DivisionData): boolean {
//   if (user.username !== getNextCoach(division).username) return false;
//   let drafted = getDrafted(division, { user: user.username });
//   if (
//     Math.floor(division.draftCount / division.coaches.length) > drafted.length
//   )
//     return false;
//   return true;
// }

// export function advanceDraft(channel: TextBasedChannel) {
//   let division = getDivisionByChannel(channel.id);
//   if (!division) return;
//   division.timer?.end();
//   division.timer = undefined;
//   division.draftCount++;
//   writeDraft();
//   notifyNext(channel);
// }

export function guildCheck(guildId: string | null) {
  return guildId === `1183936734719922176`;
}

// export function addPicks(coach: CoachData, picks: string[]) {
//   coach.leftPicks = picks
//     .map((pid) => getDraftData(pid))
//     .filter((pid) => pid != undefined);
//   writeDraft();
//   return;
// }

// export function updateTime(time: number) {
//   draftData.timerMinutes = time;
//   writeDraft();
// }

// export function addReminder(time: number) {
//   draftData.reminders.push(time);
//   writeDraft();
// }

// export function removeReminder(time: number) {
//   draftData.reminders = draftData.reminders.filter((value) => value != time);
//   writeDraft();
// }
