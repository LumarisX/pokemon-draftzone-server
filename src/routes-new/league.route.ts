import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { Types } from "mongoose";
import { z } from "zod";
import { logger } from "../app";
import { LeagueAd } from "../classes/league-ad";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import {
  client,
  findDiscordMemberInIndex,
  getDiscordMemberInGuild,
  getDiscordMemberIndex,
} from "../discord";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { rolecheck } from "../middleware/rolecheck";
import FileUploadModel from "../models/file-upload.model";
import { LeagueAdModel } from "../models/league-ad.model";
import LeagueCoachModel, {
  LeagueCoach,
  LeagueCoachDocument,
  signUpSchema,
} from "../models/league/coach.model";
import LeagueDivisionModel from "../models/league/division.model";
import {
  LeagueMatchupDocument,
  LeagueMatchupModel,
} from "../models/league/matchup.model";
import { LeagueStageModel } from "../models/league/stage.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  TeamDraft,
} from "../models/league/team.model";
import { LeagueTierListDocument } from "../models/league/tier-list.model";
import LeagueTournamentModel, {
  LeagueTournamentDocument,
} from "../models/league/tournament.model";
import { getName } from "../services/data-services/pokedex.service";
import {
  getLeagueAds,
  invalidateLeagueAdsCache,
} from "../services/league-ad/league-ad-service";
import {
  draftPokemon,
  getDivisionDetails,
  getDraftOrder,
  isCoach,
  setDivsionState,
  skipCurrentPick,
} from "../services/league-services/draft-service";
import { getRoles } from "../services/league-services/league-service";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  calculateResultScore,
  calculateTeamMatchupScoreAndWinner,
} from "../services/league-services/standings-service";
import {
  getDrafted,
  getPokemonTier,
  getTierList,
  updateTierList,
} from "../services/league-services/tier-list-service";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { s3Service } from "../services/s3.service";
import { createRoute } from "./route-builder";

const DivisionHandler = async (
  ctx: { tournament: LeagueTournamentDocument },
  division_id: string,
) => {
  const division = await LeagueDivisionModel.findOne({
    tournament: ctx.tournament.id,
    divisionKey: division_id,
  }).populate<{
    teams: LeagueTeamDocument[];
  }>("teams");

  if (!division)
    throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
      divisionKey: division_id,
      tournamentKey: ctx.tournament.tournamentKey,
    });

  return { division };
};

const DISCORD_GUILD_ID = "1183936734719922176";
const DISCORD_ROLE_IDS = ["1469151649070186576"];

export const LeagueRoute = createRoute()((r) => {
  r.get((ctx) => {
    return [];
  });
  r.path("ad-list")((r) => {
    r.get(async (ctx) => {
      const leagueAds = await getLeagueAds();
      return leagueAds;
    });
    r.path("manage").auth()((r) => {
      r.get(async (ctx) => {
        const documents = await LeagueAdModel.find({ owner: ctx.sub }).sort({
          createdAt: -1,
        });
        const leagueAds = documents.map((doc) => LeagueAd.fromDocument(doc));
        return leagueAds;
      });
      r.post.validate({
        //TODO: Define proper schema
        body: (data) => z.any().parse(data),
      })(async (ctx, req, res) => {
        const leagueAd = LeagueAd.fromForm(ctx.validatedBody, ctx.sub);
        if (!leagueAd.isValid())
          throw new PDZError(ErrorCodes.LEAGUE_AD.INVALID_AD_DATA);
        const document = await leagueAd.toDocument();
        await document.save();
        if (client) {
          try {
            const guild = await client.guilds.fetch("1183936734719922176");
            if (!guild) return;
            const channel = guild.channels.cache.get(
              "1293333149471871108",
            ) as TextChannel;
            if (channel && channel.isTextBased()) {
              const formatDate = (value?: Date) =>
                value ? value.toISOString().split("T")[0] : "TBD";
              const clamp = (value: string, limit: number) =>
                value.length > limit
                  ? `${value.slice(0, limit - 3)}...`
                  : value;

              const embed = new EmbedBuilder()
                .setTitle(clamp(leagueAd.leagueName, 256))
                .setDescription(clamp(leagueAd.description, 1024))
                .setColor("#2F80ED")
                .setTimestamp(new Date())
                .addFields(
                  {
                    name: "Status",
                    value: "Pending",
                    inline: true,
                  },
                  {
                    name: "Skill Range",
                    value: `${leagueAd.skillLevelRange.from} - ${leagueAd.skillLevelRange.to}`,
                    inline: true,
                  },
                  {
                    name: "Prize",
                    value: leagueAd.prizeValue.toString(),
                    inline: true,
                  },
                  {
                    name: "Platforms",
                    value: clamp(leagueAd.platforms.join(", "), 1024),
                    inline: false,
                  },
                  {
                    name: "Formats",
                    value: clamp(leagueAd.formats.join(", "), 1024),
                    inline: false,
                  },
                  {
                    name: "Rulesets",
                    value: clamp(leagueAd.rulesets.join(", "), 1024),
                    inline: false,
                  },
                  {
                    name: "Signups Close",
                    value: formatDate(leagueAd.closesAt),
                    inline: true,
                  },
                  {
                    name: "Season",
                    value: `${formatDate(leagueAd.seasonStart)} - ${formatDate(leagueAd.seasonEnd)}`,
                    inline: true,
                  },
                  {
                    name: "Signup Link",
                    value: clamp(leagueAd.signupLink, 1024),
                    inline: false,
                  },
                  {
                    name: "Server Link",
                    value: leagueAd.serverLink
                      ? clamp(leagueAd.serverLink, 1024)
                      : "N/A",
                    inline: false,
                  },
                  {
                    name: "League Doc",
                    value: leagueAd.leagueDoc
                      ? clamp(leagueAd.leagueDoc, 1024)
                      : "N/A",
                    inline: false,
                  },
                );

              const actionRow =
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`league-ad:approve:${document._id}`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId(`league-ad:deny:${document._id}`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger),
                );

              channel.send({
                content: "A new league ad has been submitted.",
                embeds: [embed],
                components: [actionRow],
              });
            }
          } catch (discordError) {
            logger.warn("Failed to send Discord notification:", discordError);
          }
        }

        invalidateLeagueAdsCache();
        logger.info(`New league ad created: ${document._id}`);
        res.status(201).json({ _id: document._id, status: document.status });
      });
      r.param("ad_id", (ctx, ad_id) => ({ ad_id }))((r) => {
        r.delete(async (ctx, req, res) => {
          const ad = await LeagueAdModel.findById(ctx.ad_id);
          if (!ad) throw new PDZError(ErrorCodes.LEAGUE_AD.NOT_FOUND);
          if (ad.owner !== ctx.sub)
            throw new PDZError(ErrorCodes.LEAGUE_AD.UNAUTHORIZED_ACCESS);
          await LeagueAdModel.findByIdAndDelete(ctx.ad_id);
          invalidateLeagueAdsCache();
          logger.info(`League ad deleted: ${ctx.ad_id}`);
          res.status(200).json({ message: "Ad deleted successfully" });
        });
      });
    });
  });
  r.path("tournaments")((r) => {
    r.get(async (ctx) => {});
    r.param("tournament_key", async (ctx, tournament_key) => {
      const tournament = await LeagueTournamentModel.findOne({
        tournamentKey: tournament_key,
      }).populate<{
        tierList: LeagueTierListDocument;
      }>("tierList");
      if (!tournament)
        throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
          tournamentKey: tournament_key,
        });
      const ruleset = getRuleset(tournament.tierList.ruleset);
      return { tournament, ruleset };
    })((r) => {
      r.path("bracket")((r) => {
        r.get(async (ctx) => {
          const teamData: {
            teamName: string;
            coach: string;
            logo: string;
            seed: number;
          }[] = [
            {
              teamName: `Philadelphia Flygons`,
              coach: "02ThatOneGuy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565385237-Philadelphia_Flygons.png",
              seed: 1,
            },
            {
              teamName: `Mighty Murkrow`,
              coach: "hsoj",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097094680-Mighty Murkrow.png",
              seed: 5,
            },
            {
              teamName: `Fitchburg's Sun Chasers`,
              coach: "Feather",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565484354-Fitchburgs_Sun_Chaser.png",
              seed: 2,
            },
            {
              teamName: `Chicago White Fox`,
              coach: "TheNotoriousABS",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565596549-Chicago_Ninetales.png",
              seed: 8,
            },
            {
              teamName: `Deimos Deoxys`,
              coach: "Lumaris",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1744422916695-DeimosDeoxys.png",
              seed: 3,
            },
            {
              teamName: `Alpine Arcanines`,
              coach: "Lion",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565450693-AlpineArcanines.png",
              seed: 4,
            },
            {
              teamName: `Victorious Vigoroths`,
              coach: "Speedy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/user-uploads/1745097393478-Victorious_Vigoroths.png",
              seed: 7,
            },
            {
              teamName: `Deep Sea Duskulls`,
              coach: "Emeglebon",
              logo: "",
              seed: 9,
            },
            {
              teamName: `Twinleaf Tatsugiri`,
              coach: "Penic",
              logo: "",
              seed: 10,
            },
            {
              teamName: `I like 'em THICC`,
              coach: "Kat",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565503663-I_like_em_THICC.png",
              seed: 6,
            },
            {
              teamName: `London Vespiquens`,
              coach: "Jake W",
              logo: "",
              seed: 11,
            },
            {
              teamName: `Tampa T-Chainz`,
              coach: "Spite",
              logo: "",
              seed: 12,
            },
            {
              teamName: `Kalos Quagsires`,
              coach: "Caltech_",
              logo: "",
              seed: 13,
            },
            {
              teamName: `Montreal Mean Mareanies`,
              coach: "Qofol",
              logo: "",
              seed: 14,
            },
            {
              teamName: `Chicago Sky Attack`,
              coach: "Quincy",
              logo: "",
              seed: 15,
            },
            {
              teamName: `Midnight Teddy's`,
              coach: "neb5",
              logo: "",
              seed: 16,
            },
            {
              teamName: `Moochelin Star Chefs`,
              coach: "Rai",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565579136-Moochelin_Star_Chefs.png",
              seed: 17,
            },
            {
              teamName: `Kalamazoo Komalas`,
              coach: "SuperSpiderPig",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565551389-Kalamazoo_Komalas.png",
              seed: 18,
            },
            {
              teamName: `Jokic Lokix`,
              coach: "Dotexe",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565520216-Jokic_Lokix.png",
              seed: 19,
            },
            {
              teamName: `Jimothy Jirachi Tomfoolery`,
              coach: "Jimothy J",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565565925-Jimothy_Jirachi.png",
              seed: 20,
            },
            {
              teamName: `Memphis Bloodmoons`,
              coach: "Steven",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565465031-Memphis_Bloodmoons.png",
              seed: 21,
            },
            {
              teamName: `F.C. Monterayquaza`,
              coach: "ChristianDeputy",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565535075-F.C._Monterrayquaza.png",
              seed: 22,
            },
            {
              teamName: `Chicago White Sawks`,
              coach: "BR@D",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565766076-Chicago_White_SawksBrad.png",
              seed: 23,
            },
            {
              teamName: `Bug Brigade`,
              coach: "TheNPC420",
              logo: "https://pokemondraftzone-public.s3.us-east-2.amazonaws.com/league-uploads/1746565423936-Bug_Brigade.png",
              seed: 24,
            },
            {
              teamName: `Minnesota Lycanrocs`,
              coach: "SpiralBB",
              logo: "",
              seed: 25,
            },
            {
              teamName: `Seattle Supersonics`,
              coach: "AwesomenessGuy",
              logo: "",
              seed: 26,
            },
            {
              teamName: `Fairview Floatzels`,
              coach: "Lupa",
              logo: "",
              seed: 27,
            },
            {
              teamName: `McTesuda's`,
              coach: "Lewis",
              logo: "",
              seed: 28,
            },
            {
              teamName: `Pacifidlog Pichus`,
              coach: "13Luken",
              logo: "",
              seed: 29,
            },
            {
              teamName: `Mossdeep City Sharpedos`,
              coach: "Travis",
              logo: "",
              seed: 30,
            },
            {
              teamName: `Texas Thousand`,
              coach: "CheesyBP",
              logo: "",
              seed: 31,
            },
            {
              teamName: `Kommo-o Kommanders`,
              coach: "AnimaSean",
              logo: "",
              seed: 32,
            },
          ];

          const normalized24 = {
            format: "single-elim",
            teams: teamData
              .map((t) => ({
                teamName: t.teamName,
                coachName: t.coach,
                seed: t.seed,
                logo: t.logo,
              }))
              .filter((t) => t.seed <= 24)
              .sort((a, b) => a.seed - b.seed),
            matches: [
              {
                id: "R1M1",
                round: 1,
                position: 1,
                a: { type: "seed", seed: 22 },
                b: { type: "seed", seed: 27 },
              },
              {
                id: "R1M2",
                round: 1,
                position: 2,
                a: { type: "seed", seed: 19 },
                b: { type: "seed", seed: 30 },
              },
              {
                id: "R1M3",
                round: 1,
                position: 3,
                a: { type: "seed", seed: 23 },
                b: { type: "seed", seed: 26 },
              },
              {
                id: "R1M4",
                round: 1,
                position: 4,
                a: { type: "seed", seed: 18 },
                b: { type: "seed", seed: 31 },
              },
              {
                id: "R1M5",
                round: 1,
                position: 5,
                a: { type: "seed", seed: 24 },
                b: { type: "seed", seed: 25 },
              },
              {
                id: "R1M6",
                round: 1,
                position: 6,
                a: { type: "seed", seed: 17 },
                b: { type: "seed", seed: 32 },
              },
              {
                id: "R1M7",
                round: 1,
                position: 7,
                a: { type: "seed", seed: 21 },
                b: { type: "seed", seed: 28 },
              },
              {
                id: "R1M8",
                round: 1,
                position: 8,
                a: { type: "seed", seed: 20 },
                b: { type: "seed", seed: 29 },
              },
              {
                id: "R2M1",
                round: 2,
                position: 1,
                a: { type: "seed", seed: 14 },
                b: { type: "winner", from: "R1M1" },
              },
              {
                id: "R2M2",
                round: 2,
                position: 2,
                a: { type: "seed", seed: 10 },
                b: { type: "winner", from: "R1M2" },
              },
              {
                id: "R2M3",
                round: 2,
                position: 3,
                a: { type: "seed", seed: 15 },
                b: { type: "winner", from: "R1M3" },
              },
              {
                id: "R2M4",
                round: 2,
                position: 4,
                a: { type: "seed", seed: 11 },
                b: { type: "winner", from: "R1M4" },
              },
              {
                id: "R2M5",
                round: 2,
                position: 5,
                a: { type: "seed", seed: 16 },
                b: { type: "winner", from: "R1M5" },
              },
              {
                id: "R2M6",
                round: 2,
                position: 6,
                a: { type: "seed", seed: 9 },
                b: { type: "winner", from: "R1M6" },
              },
              {
                id: "R2M7",
                round: 2,
                position: 7,
                a: { type: "seed", seed: 13 },
                b: { type: "winner", from: "R1M7" },
              },
              {
                id: "R2M8",
                round: 2,
                position: 8,
                a: { type: "seed", seed: 12 },
                b: { type: "winner", from: "R1M8" },
              },
              {
                id: "R3M1",
                round: 3,
                position: 1,
                a: { type: "seed", seed: 3 },
                b: { type: "winner", from: "R2M1" },
              },
              {
                id: "R3M2",
                round: 3,
                position: 2,
                a: { type: "seed", seed: 7 },
                b: { type: "winner", from: "R2M2" },
              },
              {
                id: "R3M3",
                round: 3,
                position: 3,
                a: { type: "seed", seed: 2 },
                b: { type: "winner", from: "R2M3" },
              },
              {
                id: "R3M4",
                round: 3,
                position: 4,
                a: { type: "seed", seed: 6 },
                b: { type: "winner", from: "R2M4" },
              },
              {
                id: "R3M5",
                round: 3,
                position: 5,
                a: { type: "seed", seed: 1 },
                b: { type: "winner", from: "R2M5" },
              },
              {
                id: "R3M6",
                round: 3,
                position: 6,
                a: { type: "seed", seed: 8 },
                b: { type: "winner", from: "R2M6" },
              },
              {
                id: "R3M7",
                round: 3,
                position: 7,
                a: { type: "seed", seed: 4 },
                b: { type: "winner", from: "R2M7" },
              },
              {
                id: "R3M8",
                round: 3,
                position: 8,
                a: { type: "seed", seed: 5 },
                b: { type: "winner", from: "R2M8" },
              },
              {
                id: "R4M1",
                round: 3,
                position: 1,
                a: { type: "winner", from: "R3M1" },
                b: { type: "winner", from: "R3M2" },
              },
              {
                id: "R4M2",
                round: 3,
                position: 2,
                a: { type: "winner", from: "R3M3" },
                b: { type: "winner", from: "R3M4" },
              },
              {
                id: "R4M3",
                round: 4,
                position: 3,
                a: { type: "winner", from: "R3M5" },
                b: { type: "winner", from: "R3M6" },
              },
              {
                id: "R4M4",
                round: 4,
                position: 4,
                a: { type: "winner", from: "R3M7" },
                b: { type: "winner", from: "R3M8" },
              },
              {
                id: "R5M1",
                round: 5,
                position: 1,
                a: { type: "winner", from: "R4M1" },
                b: { type: "winner", from: "R4M2" },
              },
              {
                id: "R5M2",
                round: 5,
                position: 2,
                a: { type: "winner", from: "R4M3" },
                b: { type: "winner", from: "R4M4" },
              },
              {
                id: "R6M1",
                round: 6,
                position: 1,
                a: { type: "winner", from: "R5M1" },
                b: { type: "winner", from: "R5M2" },
              },
            ],
          };

          return normalized24;
        });
      });
      r.path("info")((r) => {
        r.get(async (ctx) => {
          const divisions = (
            await LeagueDivisionModel.find({
              tournament: ctx.tournament._id,
              public: true,
            })
          ).map((div) => ({
            divisionKey: div.divisionKey,
            name: div.name,
          }));

          return {
            name: ctx.tournament.name,
            tournamentKey: ctx.tournament.tournamentKey,
            description: ctx.tournament.description,
            format: ctx.tournament.format,
            ruleset: ctx.tournament.ruleset,
            signUpDeadline: ctx.tournament.signUpDeadline,
            draftStart: ctx.tournament.draftStart,
            draftEnd: ctx.tournament.draftEnd,
            seasonStart: ctx.tournament.seasonStart,
            seasonEnd: ctx.tournament.seasonEnd,
            logo: ctx.tournament.logo,
            divisions,
            discord: ctx.tournament.discord,
          };
        });
      });
      r.path("roles").auth()((r) => {
        r.get(async (ctx) => getRoles(ctx.sub));
      });
      r.path("signup").auth()((r) => {
        r.post.validate({
          body: (data) => signUpSchema.parse(data),
        })(async (ctx, req, res) => {
          if (
            await LeagueCoachModel.findOne({
              auth0Id: ctx.sub,
              tournamentId: ctx.tournament._id,
            })
          )
            throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
              tournamentId: ctx.tournament._id.toString(),
            });

          const leagueCoach = new LeagueCoachModel({
            auth0Id: ctx.sub,
            name: ctx.validatedBody.name,
            gameName: ctx.validatedBody.gameName,
            discordName: ctx.validatedBody.discordName,
            timezone: ctx.validatedBody.timezone,
            tournamentId: ctx.tournament._id,
            teamName: ctx.validatedBody.teamName,
            experience: ctx.validatedBody.experience,
            droppedBefore: ctx.validatedBody.droppedBefore,
            droppedWhy: ctx.validatedBody.droppedWhy,
            confirmed: ctx.validatedBody.confirm,
            status: "pending",
            signedUpAt: new Date(),
          });
          await leagueCoach.save();
          if (client) {
            try {
              const guild = await client.guilds.fetch("1183936734719922176");
              if (guild) {
                const roleId = "1469151649070186576";
                const discordName = ctx.validatedBody.discordName?.trim();
                if (discordName) {
                  const normalized = discordName.replace(/^@/, "").trim();
                  const target = normalized.toLowerCase();
                  const targetUsername = normalized.includes("#")
                    ? normalized.split("#")[0].toLowerCase()
                    : target;
                  const matchesMember = (m: {
                    user: { username?: string };
                    displayName?: string;
                  }) => {
                    const username = m.user.username?.toLowerCase();
                    const display = m.displayName?.toLowerCase();
                    return (
                      username === target ||
                      username === targetUsername ||
                      display === target ||
                      display === targetUsername
                    );
                  };

                  let member = guild.members.cache.find(matchesMember);

                  if (!member) {
                    const fetched = await guild.members.fetch({
                      query: targetUsername,
                      limit: 10,
                    });
                    member = fetched.find(matchesMember);
                  }

                  if (!member && target !== targetUsername) {
                    const fetched = await guild.members.fetch({
                      query: target,
                      limit: 10,
                    });
                    member = fetched.find(matchesMember);
                  }

                  if (member) {
                    const role = guild.roles.cache.get(roleId);
                    if (role && !member.roles.cache.has(role.id)) {
                      await member.roles.add(role);
                    }
                  }
                }
                const channel = guild.channels.cache.get(
                  "1303896194187132978",
                ) as TextChannel;
                if (channel && channel.isTextBased()) {
                  const totalCoaches = await LeagueCoachModel.countDocuments({
                    tournamentId: ctx.tournament._id,
                  });
                  channel.send(
                    `${ctx.validatedBody.name} signed up for **${ctx.tournament.name}**. Total coaches: ${totalCoaches}.`,
                  );
                }
              }
            } catch (discordError) {
              logger.warn("Failed to send Discord notification:", discordError);
            }
          }

          return res.status(201).json({
            message: "Sign up successful.",
            userId: leagueCoach._id.toString(),
            tournamentId: ctx.tournament._id.toString(),
          });
        });
        r.path("manage").auth().use(rolecheck("organizer"))((r) => {
          r.get(async (ctx) => {
            const divisions = await LeagueDivisionModel.find({
              tournament: ctx.tournament._id,
            }).populate<{ teams: LeagueTeamDocument[] }>("teams", ["coach"]);
            const users = await LeagueCoachModel.find({
              tournamentId: ctx.tournament._id,
            });

            const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);
            const coachesWithLogos = await Promise.all(
              users.map(async (user) => {
                const division = divisions.find((division) =>
                  division.teams.some(
                    (team) => team.coach.toString() === user._id.toString(),
                  ),
                )?.divisionKey;
                const member = memberIndex
                  ? findDiscordMemberInIndex(memberIndex, user.discordName)
                  : await getDiscordMemberInGuild(
                      DISCORD_GUILD_ID,
                      user.discordName,
                    );
                const inDiscordServer = Boolean(member);
                const hasDiscordRole = Boolean(
                  member &&
                  DISCORD_ROLE_IDS.some((id) => member.roles.cache.has(id)),
                );
                return {
                  id: user._id.toString(),
                  name: user.name,
                  gameName: user.gameName,
                  discordName: user.discordName,
                  timezone: user.timezone,
                  experience: user.experience,
                  dropped: user.droppedBefore ? user.droppedWhy : undefined,
                  status: user.status,
                  teamName: user.teamName,
                  signedUpAt: user.signedUpAt,
                  logo: user.logo
                    ? s3Service.getPublicUrl(user.logo)
                    : undefined,
                  division,
                  inDiscordServer,
                  hasDiscordRole,
                };
              }),
            );

            return {
              signups: coachesWithLogos,
              divisions: divisions.map((d) => ({
                divisionKey: d.divisionKey,
                name: d.name,
              })),
            };
          });
          r.post.validate({
            body: (data) =>
              z
                .object({
                  signups: z.array(
                    z.object({
                      id: z.string(),
                      division: z.string().nullish(),
                    }),
                  ),
                })
                .parse(data),
          })(async (ctx) => {
            const divisions = await LeagueDivisionModel.find({
              tournament: ctx.tournament._id,
            }).populate<{ teams: LeagueTeamDocument[] }>("teams", ["coach"]);
            const users = await LeagueCoachModel.find({
              tournamentId: ctx.tournament._id,
            });

            const divisionsByKey = new Map(
              divisions.map((division) => [division.divisionKey, division]),
            );

            for (const signup of ctx.validatedBody.signups) {
              const coach = users.find(
                (user) => user._id.toString() === signup.id,
              );
              if (!coach) {
                continue;
              }
              const currentDivision = divisions.find((division) =>
                division.teams.some(
                  (team) => team.coach.toString() === signup.id,
                ),
              );
              const currentTeam = currentDivision?.teams.find(
                (team) => team.coach.toString() === signup.id,
              );
              const existingTeam =
                currentTeam ||
                (await LeagueTeamModel.findOne({ coach: coach._id }));

              if (!signup.division) {
                if (existingTeam) {
                  const removeResult = await LeagueDivisionModel.updateMany(
                    { tournament: ctx.tournament._id },
                    { $pull: { teams: existingTeam._id } },
                  );

                  await LeagueTeamModel.findByIdAndDelete(existingTeam._id);
                }
                continue;
              }

              const targetDivision = divisionsByKey.get(signup.division);
              if (!targetDivision) {
                throw new PDZError(ErrorCodes.DIVISION.NOT_IN_LEAGUE, {
                  divisionKey: signup.division,
                  tournamentKey: ctx.tournament.tournamentKey,
                });
              }

              if (existingTeam) {
                if (
                  currentDivision &&
                  !currentDivision._id.equals(targetDivision._id)
                ) {
                  currentDivision.teams = currentDivision.teams.filter(
                    (team) => !team._id.equals(existingTeam._id),
                  );
                  await currentDivision.save();
                } else if (!currentDivision) {
                  await LeagueDivisionModel.updateMany(
                    {
                      tournament: ctx.tournament._id,
                      _id: { $ne: targetDivision._id },
                    },
                    { $pull: { teams: existingTeam._id } },
                  );
                }

                const alreadyInDivision = targetDivision.teams.some((team) =>
                  team._id.equals(existingTeam._id),
                );
                if (!alreadyInDivision) {
                  targetDivision.teams.push(existingTeam);
                  await targetDivision.save();
                }
                continue;
              }

              const newTeam = new LeagueTeamModel({
                coach: coach._id,
                picks: [],
                draft: [],
              });
              await newTeam.save();
              targetDivision.teams.push(newTeam);
              await targetDivision.save();
            }

            return { message: "Update successful." };
          });
        });
      });
      r.path("coaches")((r) => {
        r.param("coach_id", async (ctx, coach_id) => {
          if (!Types.ObjectId.isValid(coach_id))
            throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
              coachId: coach_id,
            });

          const coach = await LeagueCoachModel.findOne({
            _id: coach_id,
            tournamentId: ctx.tournament._id,
          });

          if (!coach)
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
              tournamentKey: ctx.tournament.tournamentKey,
              coachId: coach_id,
            });

          return { coach };
        })((r) => {
          r.path("logo")((r) => {
            r.patch.auth().validate({
              body: (data) =>
                z
                  .object({
                    fileKey: z.string().min(1),
                  })
                  .parse(data),
            })(async (ctx) => {
              const roles = getRoles(ctx.sub);
              const isOrganizer = roles.includes("organizer");
              const isSelf = ctx.coach.auth0Id === ctx.sub;

              if (!isOrganizer && !isSelf)
                throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

              const uploadRecord = await FileUploadModel.findOne({
                key: ctx.validatedBody.fileKey,
                uploadedBy: ctx.sub,
                uploadType: "league-logo",
                status: "confirmed",
              });

              if (!uploadRecord) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);

              ctx.coach.logo = ctx.validatedBody.fileKey;
              await ctx.coach.save();

              await FileUploadModel.findOneAndUpdate(
                { key: ctx.validatedBody.fileKey },
                { relatedEntityId: ctx.coach._id.toString() },
              );

              return {
                message: "Logo updated.",
                logo: ctx.coach.logo,
              };
            });
          });
        });
      });
      r.path("rules")((r) => {
        r.get(async (ctx) => {
          return ctx.tournament.rules;
        });
        r.post
          .auth()
          .use(rolecheck("organizer"))
          .validate({
            body: (data) =>
              z
                .object({
                  ruleSections: z.array(
                    z.object({
                      title: z.string(),
                      body: z.string(),
                    }),
                  ),
                })
                .parse(data),
          })(async (ctx, req, res) => {
          ctx.tournament.rules = ctx.validatedBody.ruleSections;
          await ctx.tournament.save();
          return res.status(201).json({
            message: "Rules updated successfully",
          });
        });
      });
      r.path("tier-list")((r) => {
        r.get.validate({
          query: (data) =>
            z
              .object({
                division: z
                  .union([z.string().min(1), z.array(z.string().min(1))])
                  .optional(),
              })
              .parse(data),
        })(async (ctx) => {
          const { division } = ctx.validatedQuery;
          const tierList = await getTierList(ctx.tournament);

          let divisions: {
            [key: string]: {
              pokemonId: string;
            }[];
          } = {};
          if (division) divisions = await getDrafted(ctx.tournament, division);
          return { tierList, divisions };
        });
        r.path("edit").auth()((r) => {
          r.get.validate({
            query: (data) =>
              z
                .object({
                  division: z
                    .union([z.string().min(1), z.array(z.string().min(1))])
                    .optional(),
                })
                .parse(data),
          })(async (ctx) => {
            const { division } = ctx.validatedQuery;
            const tierList = await getTierList(ctx.tournament, true);
            const divisions = await getDrafted(ctx.tournament, division);
            return { tierList, divisions };
          });
          r.post.validate({
            body: (data) =>
              z
                .object({
                  tiers: z.array(
                    z.object({
                      name: z.string(),
                      cost: z.number(),
                      pokemon: z.array(
                        z.object({
                          id: z.string(),
                          name: z.string(),
                        }),
                      ),
                    }),
                  ),
                })
                .parse(data),
          })(async (ctx) => {
            const { tiers } = ctx.validatedBody;
            await updateTierList(ctx.tournament, tiers);
            logger.info(
              `Tier list updated for league ${ctx.tournament.tournamentKey} by ${ctx.sub}`,
            );
            return {
              success: true,
              message: "Tier list updated successfully",
            };
          });
        });
      });
      r.path("schedule")((r) => {
        r.get(async (ctx) => {
          const stages = await LeagueStageModel.find({
            tournamentId: ctx.tournament._id,
          });
          const stagesWithMatchups = await Promise.all(
            stages.map(async (stage) => {
              const matchups = await LeagueMatchupModel.find({
                stageId: stage._id,
              }).populate<{
                team1Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
                team2Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
              }>([
                {
                  path: "team1Id",
                  populate: {
                    path: "coach",
                  },
                },
                {
                  path: "team2Id",
                  populate: {
                    path: "coach",
                  },
                },
              ]);
              const transformedMatchups = matchups.map((matchup) => {
                const team1Doc = matchup.team1Id;
                const team2Doc = matchup.team2Id;
                const { team1Score, team2Score, winner } =
                  calculateTeamMatchupScoreAndWinner(matchup);

                return {
                  team1: {
                    teamName: team1Doc.coach.teamName,
                    coach: team1Doc.coach.name,
                    score: team1Score,
                    logo: team1Doc.coach.logo,
                    id: team1Doc._id.toString(),
                    winner:
                      winner === "team1"
                        ? true
                        : winner === "team2"
                          ? false
                          : undefined,
                  },
                  team2: {
                    teamName: team2Doc.coach.teamName,
                    coach: team2Doc.coach.name,
                    score: team2Score,
                    logo: team2Doc.coach.logo,
                    id: team2Doc._id.toString(),
                    winner:
                      winner === "team2"
                        ? true
                        : winner === "team1"
                          ? false
                          : undefined,
                  },
                  matches: matchup.results.map((result) => ({
                    link: result.replay || "",
                    team1: {
                      team: result.team1.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team1),
                      winner: result.winner === "team1",
                    },
                    team2: {
                      team: result.team2.pokemon.map((pokemon) => ({
                        id: pokemon.id,
                        name: pokemon.name,
                        status: pokemon.stats?.deaths
                          ? "fainted"
                          : pokemon.stats?.brought
                            ? "brought"
                            : undefined,
                      })),
                      score: calculateResultScore(result.team2),
                      winner: result.winner === "team2",
                    },
                  })),
                };
              });
              return {
                _id: stage._id,
                name: stage.name,
                matchups: transformedMatchups,
              };
            }),
          );
          return stagesWithMatchups;
        });
      });
      r.path("teams")((r) => {
        r.param("team_id", async (ctx, team_id) => {
          const team = await LeagueTeamModel.findById(team_id).populate({
            path: "coach",
          });
          if (!team)
            throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
              teamId: team_id,
            });
          return { team };
        })((r) => {
          r.get(async (ctx) => {
            await ctx.tournament.populate<{
              tierList: LeagueTierListDocument;
            }>("tierList");

            const draft = await Promise.all(
              ctx.team.draft.map(async (draftItem) => {
                const tier = await getPokemonTier(
                  ctx.tournament,
                  draftItem.pokemon.id,
                );
                const pokemonName = getName(draftItem.pokemon.id);
                return {
                  id: draftItem.pokemon.id,
                  name: pokemonName,
                  tier,
                  capt: {
                    tera: draftItem.addons?.includes("Tera Captain"),
                  },
                };
              }),
            );

            const teamMatchups = await LeagueMatchupModel.find({
              $or: [{ team1Id: ctx.team._id }, { team2Id: ctx.team._id }],
            }).populate<{
              team1Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
              team2Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
            }>([
              { path: "team1Id", select: "coach", populate: "coach" },
              { path: "team2Id", select: "coach", populate: "coach" },
            ]);

            const pokemonStandings = await calculateDivisionPokemonStandings(
              teamMatchups as unknown as LeagueMatchupDocument[],
              ctx.team._id.toString(),
            );

            const coach = ctx.team.coach as LeagueCoachDocument;

            return {
              name: coach.teamName,
              timezone: coach.timezone,
              coach: coach.name,
              logo: coach.logo,
              draft,
              pokemonStandings,
              matchups: teamMatchups,
            };
          });
        });
      });
      r.path("divisions")((r) => {
        r.param("division_id", DivisionHandler).auth()((r) => {
          r.get(
            async (ctx) =>
              await getDivisionDetails(ctx.tournament, ctx.division, ctx.sub),
          );
          r.path("teams")((r) => {
            r.get(async (ctx) => {
              await ctx.division.populate<{
                teams: (LeagueTeamDocument & {
                  coach: LeagueCoachDocument;
                })[];
              }>({
                path: "teams",
                populate: {
                  path: "coach",
                },
              });
              const teams = Promise.all(
                (
                  getDraftOrder(ctx.division) as (LeagueTeamDocument & {
                    coach: LeagueCoachDocument;
                  })[]
                ).map(async (team) => {
                  return {
                    id: team._id.toString(),
                    coach: team.coach.name,
                    logo: team.coach.logo,
                    draft: await Promise.all(
                      team.draft.map(async (e) => ({
                        id: e.pokemon.id,
                        name: getName(e.pokemon.id),
                        capt: {
                          tera: e.addons?.includes("Tera Captain"),
                        },
                        tier: (
                          await getPokemonTier(ctx.tournament, e.pokemon.id)
                        )?.cost,
                      })),
                    ),
                    name: team.coach.teamName,
                    isCoach: team.coach.auth0Id === ctx.sub,
                    timezone: team.coach.timezone,
                  };
                }),
              );

              return { teams };
            });
          });
          r.path("picks")((r) => {
            r.get(async (ctx) => {
              const division = await LeagueDivisionModel.findById(
                ctx.division._id,
              ).populate<{
                teams: (LeagueTeamDocument & {
                  picks: Types.DocumentArray<
                    TeamDraft & { picker: LeagueCoachDocument }
                  >;
                  coach: LeagueCoachDocument;
                })[];
              }>({
                path: "teams",
                populate: ["draft.picker", "coach"],
              });

              if (!division) throw new PDZError(ErrorCodes.DIVISION.NOT_FOUND);

              const allPicks = await Promise.all(
                division.teams.map(async (team) => {
                  const picks = await Promise.all(
                    team.draft.map(async (draftItem) => ({
                      pokemon: {
                        id: draftItem.pokemon.id,
                        name: getName(draftItem.pokemon.id),
                        tier: await getPokemonTier(
                          ctx.tournament,
                          draftItem.pokemon.id,
                        ),
                        capt: {
                          tera: draftItem.addons?.includes("Tera Captain"),
                        },
                      },
                      timestamp: draftItem.timestamp,
                      picker: (draftItem.picker as LeagueCoach)?.auth0Id,
                    })),
                  );

                  const coach = team.coach as LeagueCoachDocument;
                  return {
                    name: coach.teamName,
                    picks: picks,
                    id: team._id.toString(),
                  };
                }),
              );

              return allPicks;
            });
          });
          r.path("schedule")((r) => {
            r.get(async (ctx) => {
              const stages = await LeagueStageModel.find({
                divisionIds: ctx.division._id,
              });

              const stagesWithMatchups = await Promise.all(
                stages.map(async (stage) => {
                  const matchups = await LeagueMatchupModel.find({
                    stageId: stage._id,
                  }).populate<{
                    team1Id: LeagueTeamDocument & {
                      coach: LeagueCoachDocument;
                    };
                    team2Id: LeagueTeamDocument & {
                      coach: LeagueCoachDocument;
                    };
                  }>([
                    {
                      path: "team1Id",
                      populate: {
                        path: "coach",
                      },
                    },
                    {
                      path: "team2Id",
                      populate: {
                        path: "coach",
                      },
                    },
                  ]);

                  const transformedMatchups = matchups.map((matchup) => {
                    const team1Doc = matchup.team1Id;
                    const team2Doc = matchup.team2Id;
                    const { team1Score, team2Score, winner } =
                      calculateTeamMatchupScoreAndWinner(matchup);

                    return {
                      team1: {
                        teamName: team1Doc.coach.teamName,
                        coach: team1Doc.coach.name,
                        score: team1Score,
                        logo: team1Doc.coach.logo,
                        id: team1Doc._id.toString(),
                        winner:
                          winner === "team1"
                            ? true
                            : winner === "team2"
                              ? false
                              : undefined,
                      },
                      team2: {
                        teamName: team2Doc.coach.teamName,
                        coach: team2Doc.coach.name,
                        score: team2Score,
                        logo: team2Doc.coach.logo,
                        id: team2Doc._id.toString(),
                        winner:
                          winner === "team2"
                            ? true
                            : winner === "team1"
                              ? false
                              : undefined,
                      },
                      matches: matchup.results.map((result) => ({
                        link: result.replay || "",
                        team1: {
                          team: result.team1.pokemon.map((pokemon) => ({
                            id: pokemon.id,
                            name: pokemon.name,
                            status: pokemon.stats?.deaths
                              ? "fainted"
                              : pokemon.stats?.brought
                                ? "brought"
                                : undefined,
                          })),
                          score: calculateResultScore(result.team1),
                          winner: result.winner === "team1",
                        },
                        team2: {
                          team: result.team2.pokemon.map((pokemon) => ({
                            id: pokemon.id,
                            name: pokemon.name,
                            status: pokemon.stats?.deaths
                              ? "fainted"
                              : pokemon.stats?.brought
                                ? "brought"
                                : undefined,
                          })),
                          score: calculateResultScore(result.team2),
                          winner: result.winner === "team2",
                        },
                      })),
                    };
                  });

                  return {
                    _id: stage._id,
                    name: stage.name,
                    matchups: transformedMatchups,
                  };
                }),
              );

              return stagesWithMatchups;
            });
          });
          r.path("standings")((r) => {
            r.get(async (ctx) => {
              const stages = await LeagueStageModel.find({
                divisionIds: ctx.division._id,
              });

              const allMatchups = await LeagueMatchupModel.find({
                stageId: { $in: stages.map((s) => s._id) },
              }).populate<{
                team1Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
                team2Id: LeagueTeamDocument & { coach: LeagueCoachDocument };
              }>([
                {
                  path: "team1Id",
                  select: "coach",
                  populate: { path: "coach" },
                },
                {
                  path: "team2Id",
                  select: "coach",
                  populate: { path: "coach" },
                },
              ]);

              const divisionTeams = await LeagueTeamModel.find({
                _id: { $in: ctx.division.teams },
              }).populate({ path: "coach" });

              const coachStandings = await calculateDivisionCoachStandings(
                allMatchups as unknown as LeagueMatchupDocument[],
                stages,
                divisionTeams,
              );

              const pokemonStandings = await calculateDivisionPokemonStandings(
                allMatchups as unknown as LeagueMatchupDocument[],
              );

              return {
                coachStandings: {
                  //TODO: make dynamic
                  cutoff: 8,
                  weeks: stages.length,
                  teams: coachStandings,
                },
                pokemonStandings,
              };
            });
          });
          r.path("order")((r) => {
            r.get(async (ctx) => {
              await ctx.division.populate<{ teams: LeagueTeamDocument[] }>(
                "teams",
              );

              const draftStyle = ctx.division.draftStyle;
              const numberOfRounds = (
                ctx.tournament.tierList as LeagueTierListDocument
              ).draftCount.max;

              const initialTeamOrder = ctx.division
                .teams as LeagueTeamDocument[];
              type DraftPick = {
                teamName: string;
                pokemon?: { id: string; name: string };
                skipTime?: Date;
              };

              type DraftRound = DraftPick[];

              const draftRounds: DraftRound[] = [];

              for (let round = 0; round < numberOfRounds; round++) {
                const currentRound: DraftPick[] = [];
                let pickingOrder = [...initialTeamOrder];

                if (draftStyle === "snake" && round % 2 === 1) {
                  pickingOrder.reverse();
                }

                for (const [index, team] of pickingOrder.entries()) {
                  const coach = team.coach as LeagueCoachDocument;
                  const draftPick: DraftPick = { teamName: coach.teamName };
                  if (team.draft[round]) {
                    const pokemonId = team.draft[round].pokemon.id;
                    const pokemonName = getName(pokemonId);
                    draftPick.pokemon = { id: pokemonId, name: pokemonName };
                  }
                  if (
                    ctx.division.draftCounter ===
                    round * pickingOrder.length + index
                  ) {
                    // TODO: remove random for production
                    // draftPick.skipTime = division.skipTime
                    const now = new Date();
                    const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
                    const randomOffsetMinutes = Math.random() * 20 - 10; // Random number between -10 and +10
                    const randomOffsetMilliseconds =
                      randomOffsetMinutes * 60 * 1000; // Convert to milliseconds
                    draftPick.skipTime = new Date(
                      now.getTime() + thirtyMinutes + randomOffsetMilliseconds,
                    );
                  }
                  currentRound.push(draftPick);
                }
                draftRounds.push(currentRound);
              }

              return draftRounds;
            });
          });
          r.path("power-rankings").auth()((r) => {
            r.get(async (ctx) => {
              const tierList = ctx.tournament
                .tierList as LeagueTierListDocument;
              const ruleset = getRuleset(tierList.ruleset);
              const teams = await Promise.all(
                (
                  ctx.division.teams as (LeagueTeamDocument & {
                    coach: LeagueCoachDocument;
                  })[]
                ).map(async (team, index) => {
                  const teamRaw = team.draft.map((draftItem) => ({
                    id: draftItem.pokemon.id,
                  }));
                  const draft = DraftSpecie.getTeam(teamRaw, ruleset);
                  const typechart = new Typechart(draft);
                  const summary = new SummaryClass(draft);
                  const coach = team.coach as LeagueCoachDocument;
                  return {
                    info: {
                      name: coach.teamName,
                      index,
                      id: team._id.toString(),
                    },
                    typechart: typechart.toJson(),
                    recommended: typechart.recommended(),
                    summary: summary.toJson(),
                    movechart: await movechart(draft, ruleset),
                    coverage: await plannerCoverage(draft),
                  };
                }),
              );
              return teams;
            });
          });

          r.path("teams")((r) => {
            r.param("team_id", async (ctx, team_id) => {
              const team = await LeagueTeamModel.findById(team_id);
              if (!team)
                throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
                  teamId: team_id,
                });
              if (!ctx.division.teams.some((t) => t._id.equals(team._id)))
                throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
                  teamId: team_id,
                  divisionKey: ctx.division.divisionKey,
                });
              return { team };
            })((r) => {
              r.path("draft")((r) => {
                r.post.validate({
                  body: (data) =>
                    z
                      .object({
                        pick: z.object({
                          pokemonId: z.string().min(1),
                          addons: z.array(z.string()).optional(),
                        }),
                      })
                      .parse(data),
                })(async (ctx) => {
                  if (!(await isCoach(ctx.team, ctx.sub)))
                    throw new PDZError(ErrorCodes.AUTH.FORBIDDEN, {
                      reason: "User is not a coach on this team",
                    });
                  await draftPokemon(
                    ctx.tournament,
                    ctx.division,
                    ctx.team,
                    ctx.validatedBody.pick,
                  );
                  return { message: "Drafted successfully." };
                });
              });
              r.path("picks")((r) => {
                r.post.validate({
                  body: (data) =>
                    z
                      .object({
                        picks: z.array(
                          z.array(
                            z.object({
                              pokemonId: z.string().min(1),
                              addons: z.array(z.string()).optional(),
                            }),
                          ),
                        ),
                      })
                      .parse(data),
                })(async (ctx) => {
                  ctx.team.picks = ctx.validatedBody.picks;
                  await ctx.team.save();
                  return { message: "Draft pick set successfully." };
                });
              });
            });
          });
        });
      });
      r.path("manage").auth()((r) => {
        r.path("divisions").use(rolecheck("organizer"))((r) => {
          r.param(
            "division_id",
            DivisionHandler,
          )((r) => {
            r.path("state")((r) => {
              r.post.validate({
                body: (data) =>
                  z.object({ state: z.string().min(1) }).parse(data),
              })(async (ctx) => {
                const { state } = ctx.validatedBody;
                await setDivsionState(ctx.tournament, ctx.division, state);
                return { message: "Timer set successfully." };
              });
            });
            r.path("skip")((r) => {
              r.post(async (ctx) => {
                await skipCurrentPick(ctx.tournament, ctx.division);
                return { message: "Skip successful." };
              });
            });
            r.path("setdraft")((r) => {
              r.post.validate({
                body: (data) =>
                  z
                    .object({
                      teamId: z.string().min(1),
                      pick: z.object({
                        pokemonId: z.string().min(1),
                        addons: z.array(z.string()).optional(),
                      }),
                    })
                    .parse(data),
              })(async (ctx) => {
                const { pick, teamId } = ctx.validatedBody;
                const team = ctx.division.teams.find((team) =>
                  team._id.equals(teamId),
                ) as LeagueTeamDocument | undefined;
                if (!team)
                  throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
                    teamId,
                  });
                await draftPokemon(ctx.tournament, ctx.division, team, pick);
                return { message: "Draft pick set successfully." };
              });
            });
          });
        });
      });
    });
  });
});
