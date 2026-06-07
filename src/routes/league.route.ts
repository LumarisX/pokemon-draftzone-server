import { SpeciesName } from "@pkmn/data";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { logger } from "../app";
import { LeagueAd } from "../classes/league-ad";
import { PopulatedLeagueMatchup } from "../classes/matchup";
import { DraftSpecie } from "../classes/pokemon";
import { getRuleset } from "../data/rulesets";
import {
  client,
  findDiscordMemberInIndex,
  getDiscordMemberIndex,
  getDiscordMemberInGuild,
} from "../discord";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";
import { rolecheck } from "../middleware/rolecheck";
import FileUploadModel from "../models/file-upload.model";
import { LeagueAdModel } from "../models/league-ad.model";
import LeagueCoachModel, {
  LeagueCoachDocument,
  signUpSchema,
} from "../models/league/coach.model";
import LeagueDivisionModel, {
  DraftTrade,
  LeagueDivisionDocument,
} from "../models/league/division.model";
import LeagueModel from "../models/league/league.model";
import {
  LeagueMatchupDocument,
  LeagueMatchupModel,
  PokemonStats,
} from "../models/league/matchup.model";
import LeagueTeamModel, {
  LeagueTeamDocument,
  PopulatedLeagueTeamDocument,
  TeamDraft,
} from "../models/league/team.model";
import {
  LeagueTierListDocument,
  TierListPokemonAddon,
} from "../models/league/tier-list.model";
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
  makeTrade,
  setDivsionState,
  skipCurrentPick,
} from "../services/league-services/draft-service";
import {
  getRoles,
  getRosterByStage,
  getTeamDraft,
} from "../services/league-services/league-service";
import {
  calculateDivisionCoachStandings,
  calculateDivisionPokemonStandings,
  calculateTeamScore,
} from "../services/league-services/standings-service";
import {
  getDrafted,
  updateTierList,
} from "../services/league-services/tier-list-service";
import { plannerCoverage } from "../services/matchup-services/coverage.service";
import { movechart } from "../services/matchup-services/movechart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { s3Service } from "../services/s3.service";
import { getTierList } from "../services/tier-lists-services/tier-list-service";
import { createRoute } from "./route-builder";

const matchupPokemonStatsSchema = z.object({
  kills: z.object({
    direct: z.number().optional(),
    indirect: z.number().optional(),
    teammate: z.number().optional(),
  }),
  status: z.enum(["brought", "survived", "fainted"]).nullable(),
});

const DivisionHandler = async (
  ctx: { tournament: LeagueTournamentDocument },
  division_id: string,
) => {
  const division = await LeagueDivisionModel.findOne({
    tournament: ctx.tournament._id,
    divisionKey: division_id,
  }).populate<{
    teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
  }>({
    path: "teams",
    populate: {
      path: "coach",
    },
  });

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

              const actionRow = new ActionRowBuilder().addComponents(
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
                components: [actionRow.toJSON()],
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
          const playoffsStage = ctx.tournament.stages?.find(
            (s) => s.name === "Playoffs",
          );

          if (!playoffsStage) {
            return { format: null, teams: [], rounds: [], matches: [] };
          }

          const roundIds = playoffsStage.rounds.map((r) => r._id);
          const bracketMatchups = await LeagueMatchupModel.find({
            round: { $in: roundIds },
          })
            .sort({ _id: 1 })
            .lean();

          // Load teams from playoffs.teams (array index + 1 = seed)
          const teamObjIds = (
            ctx.tournament.playoffs.teams as unknown as Types.ObjectId[]
          ).map((t) => new Types.ObjectId(t.toString()));

          const teamDocs = await LeagueTeamModel.find({
            _id: { $in: teamObjIds },
          }).populate<{ coach: LeagueCoachDocument }>("coach");

          // Collect unique division IDs from matchups + team membership
          const matchupDivisionIds = [
            ...new Set(
              bracketMatchups
                .filter((m) => m.division)
                .map((m) => m.division.toString()),
            ),
          ];

          const divisions = await LeagueDivisionModel.find({
            $or: [
              { tournament: ctx.tournament._id, teams: { $in: teamObjIds } },
              { _id: { $in: matchupDivisionIds } },
            ],
          });

          const teamToDivision = new Map<string, string>();
          const divisionIdToKey = new Map<string, string>();
          divisions.forEach((div) => {
            divisionIdToKey.set(div._id.toString(), div.divisionKey);
            div.teams.forEach((teamId) => {
              teamToDivision.set(teamId.toString(), div.divisionKey);
            });
          });

          const teamsArray = teamObjIds
            .map((teamId, idx) => {
              const teamDoc = teamDocs.find(
                (t) => t._id.toString() === teamId.toString(),
              );
              if (!teamDoc) return null;
              return {
                seed: idx + 1,
                teamName: teamDoc.teamName,
                coachName: teamDoc.coach.name,
                logo: teamDoc.logo,
                divisionKey: teamToDivision.get(teamDoc._id.toString()),
                teamId: teamDoc._id.toString(),
              };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

          const roundIdToName = new Map(
            playoffsStage.rounds.map((r) => [r._id.toString(), r.name]),
          );

          const matches = bracketMatchups.map((m) => ({
            _id: m._id.toString(),
            round: m.round?.toString() ?? null,
            roundName: m.round
              ? (roundIdToName.get(m.round.toString()) ?? null)
              : null,
            a: m.side1.slot
              ? {
                  type: m.side1.slot.type,
                  ...(m.side1.slot.type === "seed"
                    ? { seed: m.side1.slot.seed }
                    : { from: (m.side1.slot as any).matchId }),
                }
              : null,
            b: m.side2.slot
              ? {
                  type: m.side2.slot.type,
                  ...(m.side2.slot.type === "seed"
                    ? { seed: m.side2.slot.seed }
                    : { from: (m.side2.slot as any).matchId }),
                }
              : null,
            winner:
              m.winner === "side1" ? 0 : m.winner === "side2" ? 1 : undefined,
            replay: m.results?.[0]?.replay,
            divisionKey: m.division
              ? (divisionIdToKey.get(m.division.toString()) ?? null)
              : null,
          }));

          const rounds = playoffsStage.rounds.map((r) => ({
            _id: r._id.toString(),
            name: r.name,
            matchDeadline: r.matchDeadline ?? null,
          }));

          return {
            format: playoffsStage.type,
            teams: teamsArray,
            rounds,
            matches,
          };
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
            format: ctx.tournament.tierList.format,
            ruleset: ctx.tournament.tierList.ruleset,
            signUpDeadline: ctx.tournament.signUpDeadline,
            draftStart: ctx.tournament.draftStart,
            draftEnd: ctx.tournament.draftEnd,
            seasonStart: ctx.tournament.seasonStart,
            seasonEnd: ctx.tournament.seasonEnd,
            logo: ctx.tournament.logo,
            divisions,
            discord: ctx.tournament.discord,
            tierListId: ctx.tournament.tierList._id?.toString(),
          };
        });
      });
      r.path("roles").auth()((r) => {
        r.get(async (ctx) => await getRoles(ctx.tournament, ctx.sub));
      });
      r.path("signup").auth()((r) => {
        r.get(async (ctx) => {
          const coach = await LeagueCoachModel.findOne({
            auth0Id: ctx.sub,
            tournamentId: ctx.tournament._id,
          });
          if (!coach)
            throw new PDZError(ErrorCodes.COACH.NOT_FOUND, {
              tournamentId: ctx.tournament._id.toString(),
            });

          const team = await LeagueTeamModel.findOne({ coach: coach._id });
          if (!team)
            throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
              tournamentId: ctx.tournament._id.toString(),
            });
          let division: { divisionKey: string; name: string } | null = null;
          if (team) {
            const div = await LeagueDivisionModel.findOne({
              tournament: ctx.tournament._id,
              teams: team._id,
            });
            if (div) {
              division = { divisionKey: div.divisionKey, name: div.name };
            }
          }

          const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);
          const member = memberIndex
            ? findDiscordMemberInIndex(memberIndex, coach.discordName)
            : await getDiscordMemberInGuild(
                DISCORD_GUILD_ID,
                coach.discordName,
              );
          const inDiscordServer = Boolean(member);

          return {
            name: coach.name,
            gameName: coach.gameName,
            discordName: coach.discordName,
            timezone: coach.timezone,
            teamName: team.teamName,
            status: coach.status,
            logo: team.logo,
            signedUpAt: coach.signedUpAt,
            teamId: team?._id.toString(),
            division,
            inDiscordServer,
          };
        });
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
            logo: ctx.validatedBody.logo,
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

                  const formatDate = (value?: Date) =>
                    value ? value.toISOString().split("T")[0] : "TBD";
                  const clamp = (value: string, limit: number) =>
                    value.length > limit
                      ? `${value.slice(0, limit - 3)}...`
                      : value;

                  const embed = new EmbedBuilder()
                    .setTitle(clamp(ctx.validatedBody.name, 256))
                    .setColor("#2F80ED")
                    .setTimestamp(new Date())
                    .addFields(
                      {
                        name: "Team Name",
                        value: ctx.validatedBody.teamName,
                        inline: true,
                      },
                      {
                        name: "In-Game Name",
                        value: ctx.validatedBody.gameName,
                        inline: true,
                      },
                      {
                        name: "Discord Name",
                        value: ctx.validatedBody.discordName,
                        inline: true,
                      },
                      {
                        name: "Timezone",
                        value: ctx.validatedBody.timezone,
                        inline: true,
                      },
                      {
                        name: "Experience",
                        value: clamp(ctx.validatedBody.experience, 1024),
                        inline: false,
                      },
                    );

                  if (ctx.validatedBody.logo && s3Service.isEnabled()) {
                    embed.setImage(
                      s3Service.getPublicUrl(ctx.validatedBody.logo),
                    );
                  }

                  channel.send({
                    content: `There's a new sign up for **${ctx.tournament.name}**! Total sign ups: ${totalCoaches}`,
                    embeds: [embed],
                  });
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
        r
          .path("manage")
          .auth()
          .use((ctx) => rolecheck(ctx.tournament, "organizer"))((r) => {
          r.get(async (ctx) => {
            const divisions = await LeagueDivisionModel.find({
              tournament: ctx.tournament._id,
            }).populate<{ teams: LeagueTeamDocument[] }>("teams", ["coach"]);
            const users = await LeagueCoachModel.find({
              tournamentId: ctx.tournament._id,
            });

            const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);
            const coachesWithLogos = [] as string[];
            // await Promise.all(
            //   users.map(async (user) => {
            //     const division = divisions.find((division) =>
            //       division.teams.some(
            //         (team) => team.coach.toString() === user._id.toString(),
            //       ),
            //     )?.divisionKey;
            //     const member = memberIndex
            //       ? findDiscordMemberInIndex(memberIndex, user.discordName)
            //       : await getDiscordMemberInGuild(
            //           DISCORD_GUILD_ID,
            //           user.discordName,
            //         );
            //     const inDiscordServer = Boolean(member);
            //     const hasDiscordRole = Boolean(
            //       member &&
            //       DISCORD_ROLE_IDS.some((id) => member.roles.cache.has(id)),
            //     );
            //     return {
            //       id: user._id.toString(),
            //       name: user.name,
            //       gameName: user.gameName,
            //       discordName: user.discordName,
            //       timezone: user.timezone,
            //       experience: user.experience,
            //       dropped: user.droppedBefore ? user.droppedWhy : undefined,
            //       status: user.status,
            //       teamName: user.teamName,
            //       signedUpAt: user.signedUpAt,
            //       logo: user.logo
            //         ? s3Service.getPublicUrl(user.logo)
            //         : undefined,
            //       division,
            //       inDiscordServer,
            //       hasDiscordRole,
            //     };
            //   }),
            // );

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
      r.path("team")((r) => {
        r.param("team_id", async (ctx, team_id) => {
          if (!Types.ObjectId.isValid(team_id))
            throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
              team_id,
            });

          const team = await LeagueTeamModel.findOne({
            _id: team_id,
            tournamentId: ctx.tournament._id,
          }).populate<{ coach: LeagueCoachDocument }>("coach");

          if (!team)
            throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
              tournamentKey: ctx.tournament.tournamentKey,
              coachId: team_id,
            });

          return { team };
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
              const roles = await getRoles(ctx.tournament, ctx.sub);
              const isOrganizer = roles.includes("organizer");
              const isSelf = ctx.team.coach.auth0Id === ctx.sub;

              if (!isOrganizer && !isSelf)
                throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

              const uploadRecord = await FileUploadModel.findOne({
                key: ctx.validatedBody.fileKey,
                uploadedBy: ctx.sub,
                uploadType: "league-logo",
                status: "confirmed",
              });

              if (!uploadRecord) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);

              ctx.team.logo = ctx.validatedBody.fileKey;
              await ctx.team.save();

              await FileUploadModel.findOneAndUpdate(
                { key: ctx.validatedBody.fileKey },
                { relatedEntityId: ctx.team._id.toString() },
              );

              return {
                message: "Logo updated.",
                logo: ctx.team.logo,
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
          .use((ctx) => rolecheck(ctx.tournament, "organizer"))
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
      r.path("divisions")((r) => {
        r.param("division_id", DivisionHandler).auth()((r) => {
          r.get(
            async (ctx) =>
              await getDivisionDetails(ctx.tournament, ctx.division, ctx.sub),
          );
          r.path("teams")((r) => {
            r.get(async (ctx) => {
              const division = await ctx.division.populate<{
                teams: (LeagueTeamDocument & {
                  coach: LeagueCoachDocument;
                })[];
              }>([
                {
                  path: "teams",
                  populate: {
                    path: "coach",
                  },
                },
              ]);

              const tournament = (await ctx.tournament.populate<{
                tierList: LeagueTierListDocument;
              }>("tierList")) as LeagueTournamentDocument & {
                tierList: LeagueTierListDocument;
              };

              const allMatchups = await LeagueMatchupModel.find({
                division: ctx.division._id,
              }).populate<PopulatedLeagueMatchup>([
                { path: "side1.team", populate: "coach" },
                { path: "side2.team", populate: "coach" },
              ]);

              const pokemonStandings =
                await calculateDivisionPokemonStandings(allMatchups);

              const { coachStandings, diffMode } =
                await calculateDivisionCoachStandings(
                  allMatchups,
                  ctx.division,
                  tournament,
                );

              const teams = getDraftOrder(ctx.division).map((team) => {
                const standings = coachStandings.find(
                  (c) => c.id === team._id.toString(),
                );
                const record = standings
                  ? {
                      wins: standings.wins,
                      losses: standings.losses,
                      pokemonDiff: standings.pokemonDiff,
                      gameDiff: standings.gameDiff,
                    }
                  : undefined;
                return {
                  id: team._id.toString(),
                  coach: team.coach.name,
                  logo: team.logo,
                  draft: getRosterByStage(team, division).map((pokemon) => ({
                    id: pokemon.id,
                    name: getName(pokemon.id),
                    capt: {
                      tera: pokemon.addons?.includes("Tera Captain"),
                    },
                    cost: tournament.tierList.getPokemonCost(
                      pokemon.id,
                      pokemon.addons,
                    ),
                    record: pokemonStandings.find((p) => p.id === pokemon.id)
                      ?.record,
                  })),
                  name: team.teamName,
                  isCoach: team.coach.auth0Id === ctx.sub,
                  timezone: team.coach.timezone,
                  record,
                  diffMode,
                };
              });

              return { teams };
            });
            r.param("team_id", async (ctx, team_id) => {
              const team = await LeagueTeamModel.findById(team_id).populate<{
                coach: LeagueCoachDocument;
              }>({
                path: "coach",
              });
              if (!team)
                throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, {
                  teamId: team_id,
                });
              return {
                team: team as LeagueTeamDocument & {
                  coach: LeagueCoachDocument;
                },
              };
            })((r) => {
              r.get(async (ctx) => {
                const tournament = (await ctx.tournament.populate<{
                  tierList: LeagueTierListDocument;
                }>("tierList")) as LeagueTournamentDocument & {
                  tierList: LeagueTierListDocument;
                };

                const draft: {
                  id: string;
                  name: "" | SpeciesName;
                  cost: number | undefined;
                  capt: {
                    tera: true | undefined;
                  };
                  record?: {
                    kills: number;
                    deaths: number;
                    brought: number;
                    diff: number;
                  };
                }[] = getTeamDraft(ctx.team, ctx.division, tournament);

                const teamMatchups = await LeagueMatchupModel.find({
                  division: ctx.division._id,
                  $or: [
                    { "side1.team": ctx.team._id },
                    { "side2.team": ctx.team._id },
                  ],
                }).populate<PopulatedLeagueMatchup>([
                  { path: "side1.team", populate: "coach" },
                  { path: "side2.team", populate: "coach" },
                ]);

                const pokemonStandings =
                  await calculateDivisionPokemonStandings(
                    teamMatchups,
                    ctx.team._id.toString(),
                  );

                pokemonStandings.forEach((pokemon) => {
                  const draftPokemon = draft.find((p) => p.id === pokemon.id);
                  if (draftPokemon) draftPokemon.record = pokemon.record;
                });

                const coach = ctx.team.coach;

                const teamRecord = await calculateTeamScore(
                  teamMatchups,
                  ctx.division.stages,
                  ctx.team,
                  ctx.tournament.forfeit,
                );

                return {
                  name: ctx.team.teamName,
                  timezone: coach.timezone,
                  coach: coach.name,
                  logo: ctx.team.logo,
                  draft,
                  matchups: teamMatchups,
                  record: {
                    wins: teamRecord.wins,
                    losses: teamRecord.losses,
                    pokemonDiff: teamRecord.pokemonDiff,
                    gameDiff: teamRecord.gameDiff,
                  },
                };
              });
            });
          });
          r.path("picks")((r) => {
            r.get(async (ctx) => {
              const division = await LeagueDivisionModel.findById(
                ctx.division._id,
              ).populate<{
                teams: (LeagueTeamDocument & {
                  picks: (TeamDraft & { picker: LeagueCoachDocument })[];
                  draft: (TeamDraft & { picker: LeagueCoachDocument })[];
                  coach: LeagueCoachDocument;
                })[];
              }>({
                path: "teams",
                populate: ["draft.picker", "coach"],
              });

              if (!division) throw new PDZError(ErrorCodes.DIVISION.NOT_FOUND);

              const tierList = ctx.tournament.tierList;

              const allPicks = await Promise.all(
                division.teams.map(async (team) => {
                  const picks = await Promise.all(
                    team.draft.map(
                      async (
                        draftItem: TeamDraft & { picker: LeagueCoachDocument },
                      ) => ({
                        pokemon: {
                          id: draftItem.pokemon.id,
                          name: getName(draftItem.pokemon.id),
                          tier: tierList.getPokemonTier(draftItem.pokemon.id)
                            ?.name,
                          capt: {
                            tera: draftItem.addons?.includes("Tera Captain"),
                          },
                        },
                        timestamp: draftItem.timestamp,
                        picker: draftItem.picker?.auth0Id,
                      }),
                    ),
                  );

                  return {
                    name: team.teamName,
                    picks: picks,
                    id: team._id.toString(),
                  };
                }),
              );

              return allPicks;
            });
          });
          r.path("schedule")((r) => {
            r.get.validate({
              query: (data) =>
                z
                  .object({
                    teamId: z
                      .union([z.string(), z.array(z.string())])
                      .optional(),
                    stage: z.string().optional(),
                  })
                  .optional()
                  .parse(data),
            })(async (ctx) => {
              const teamId = ctx.validatedQuery?.teamId;
              const currentStageOnly =
                ctx.validatedQuery?.stage?.toLowerCase() === "current";
              const hasTeamFilter = teamId !== undefined;
              const teamIds = (Array.isArray(teamId) ? teamId : [teamId])
                .filter((id): id is string => Boolean(id))
                .filter((id) => isValidObjectId(id))
                .map((id) => new Types.ObjectId(id));

              const allMatchups = await LeagueMatchupModel.find({
                stage: {
                  $in: ctx.division.stages
                    .filter(
                      (stage) =>
                        !currentStageOnly ||
                        stage._id.equals(
                          ctx.division.stages[ctx.division.currentStage]._id,
                        ),
                    )
                    .map((stage) => stage._id),
                },
                ...(hasTeamFilter
                  ? {
                      $or: [
                        { "side1.team": { $in: teamIds } },
                        { "side2.team": { $in: teamIds } },
                      ],
                    }
                  : undefined),
              }).populate<PopulatedLeagueMatchup>([
                {
                  path: "side1.team",
                  populate: {
                    path: "coach",
                  },
                },
                {
                  path: "side2.team",
                  populate: {
                    path: "coach",
                  },
                },
              ]);

              const matchupsByStage = new Map<string, typeof allMatchups>();
              for (const matchup of allMatchups) {
                const stageKey = matchup.round!.toString();
                const bucket = matchupsByStage.get(stageKey);
                if (bucket) {
                  bucket.push(matchup);
                } else {
                  matchupsByStage.set(stageKey, [matchup]);
                }
              }

              const stages = ctx.division.stages
                .filter(
                  (stage) =>
                    !currentStageOnly ||
                    stage._id.equals(
                      ctx.division.stages[ctx.division.currentStage]._id,
                    ),
                )
                .map((stage) => {
                  const matchups =
                    matchupsByStage.get(stage._id.toString()) ?? [];
                  const transformedMatchups = matchups.map((matchup) => {
                    return {
                      id: matchup._id.toString(),
                      team1: {
                        name: matchup.side1.team.teamName,
                        coach: matchup.side1.team.coach.name,
                        score: matchup.forfeit
                          ? matchup.winner === "side1"
                            ? ctx.tournament.forfeit.gameDiff
                            : 0
                          : matchup.side1.score,
                        logo: matchup.side1.team.logo,
                        id: matchup.side1.team._id.toString(),
                        draft: matchup.side1.team.draft.map((draftItem) => ({
                          id: draftItem.pokemon.id,
                          capt: {
                            ...(draftItem.addons?.includes("Tera Captain")
                              ? { tera: true }
                              : undefined),
                          },
                        })),
                      },
                      team2: {
                        name: matchup.side2.team.teamName,
                        coach: matchup.side2.team.coach.name,
                        score: matchup.forfeit
                          ? matchup.winner === "side2"
                            ? ctx.tournament.forfeit.gameDiff
                            : 0
                          : matchup.side2.score,
                        logo: matchup.side2.team.logo,
                        id: matchup.side2.team._id.toString(),
                        draft: matchup.side2.team.draft.map((draftItem) => ({
                          id: draftItem.pokemon.id,
                          capt: {
                            ...(draftItem.addons?.includes("Tera Captain")
                              ? { tera: true }
                              : undefined),
                          },
                        })),
                      },
                      matches: matchup.results.map((result) => ({
                        link: result.replay,
                        team1: {
                          team: Object.fromEntries(
                            result.side1.pokemon.entries(),
                          ),
                          score: result.side1.score,
                          winner: result.winner === "side1",
                        },
                        team2: {
                          team: Object.fromEntries(
                            result.side2.pokemon.entries(),
                          ),
                          score: result.side2.score,
                          winner: result.winner === "side2",
                        },
                      })),
                      winner: matchup.winner,
                    };
                  });
                  return {
                    _id: stage._id,
                    name: stage.name,
                    matchups: transformedMatchups,
                  };
                });

              return stages;
            });
          });
          r.path("standings")((r) => {
            r.get(async (ctx) => {
              const allMatchups = await LeagueMatchupModel.find({
                stage: { $in: ctx.division.stages.map((s) => s._id) },
              }).populate<PopulatedLeagueMatchup>([
                {
                  path: "side1.team",
                  populate: { path: "coach" },
                },
                {
                  path: "side2.team",
                  populate: { path: "coach" },
                },
                {
                  path: "division",
                  populate: "tournament",
                },
              ]);

              const division = (await ctx.division.populate<{
                teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
                tournament: LeagueTournamentDocument;
              }>([
                {
                  path: "teams",
                  populate: {
                    path: "coach",
                  },
                },
              ])) as LeagueDivisionDocument & {
                teams: (LeagueTeamDocument & { coach: LeagueCoachDocument })[];
              };

              const { coachStandings, diffMode } =
                await calculateDivisionCoachStandings(
                  allMatchups,
                  division,
                  ctx.tournament,
                );

              const pokemonStandings =
                await calculateDivisionPokemonStandings(allMatchups);

              return {
                coachStandings: {
                  //TODO: make dynamic
                  cutoff: 8,
                  weeks: ctx.division.stages.length,
                  teams: coachStandings,
                  diffMode,
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

              const orderProgression = ctx.division.draft.orderProgression;
              const numberOfRounds = ctx.tournament.tierList.draftCount.max;

              const initialTeamOrder = ctx.division.teams;
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

                if (orderProgression === "snake" && round % 2 === 1) {
                  pickingOrder.reverse();
                }

                for (const [index, team] of pickingOrder.entries()) {
                  const coach = team.coach;
                  const draftPick: DraftPick = { teamName: team.teamName };
                  if (team.draft[round]) {
                    const pokemonId = team.draft[round].pokemon.id;
                    const pokemonName = getName(pokemonId);
                    draftPick.pokemon = { id: pokemonId, name: pokemonName };
                  }
                  if (
                    ctx.division.draft.counter ===
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
              const tierList = ctx.tournament.tierList;
              const ruleset = getRuleset(tierList.ruleset);
              const teams = await Promise.all(
                ctx.division.teams.map(async (team, index) => {
                  const teamRaw = team.draft.map((draftItem) => ({
                    id: draftItem.pokemon.id,
                  }));
                  const draft = DraftSpecie.getTeam(teamRaw, ruleset);
                  const typechart = new Typechart(draft);
                  const summary = new SummaryClass(draft);
                  const coach = team.coach;
                  return {
                    info: {
                      name: team.teamName,
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
          r.path("trades")((r) => {
            r.get.validate({
              query: (data) =>
                z
                  .object({
                    teamId: z
                      .union([z.string(), z.array(z.string())])
                      .optional(),
                  })
                  .optional()
                  .parse(data),
            })(async (ctx) => {
              //TODO: Absolutely need to optimize this at some point, but it should be fine for now since trades are unlikely to be a bottleneck
              const tournament = await ctx.tournament.populate<{
                tierList: LeagueTierListDocument;
              }>("tierList");
              const teamId = ctx.validatedQuery?.teamId;
              const teamIds = (Array.isArray(teamId) ? teamId : [teamId])
                .filter((id): id is string => Boolean(id))
                .filter((id) => isValidObjectId(id));
              const trades = await Promise.all(
                ctx.division.trades
                  .filter(
                    (trade) =>
                      !teamId ||
                      teamIds.includes(
                        trade.side1.team?._id.toString() ?? "",
                      ) ||
                      teamIds.includes(trade.side2.team?._id.toString() ?? ""),
                  )
                  .map(async (trade) => {
                    const side1Team = await LeagueTeamModel.findById(
                      trade.side1.team,
                    ).populate<
                      LeagueTeamDocument & { coach: LeagueCoachDocument }
                    >("coach");
                    const side2Team = await LeagueTeamModel.findById(
                      trade.side2.team,
                    ).populate<
                      LeagueTeamDocument & { coach: LeagueCoachDocument }
                    >("coach");
                    return {
                      side1: {
                        team: side1Team
                          ? {
                              name: side1Team.teamName,
                              coach: side1Team.coach.name,
                              logo: side1Team.logo,
                            }
                          : undefined,
                        pokemon: trade.side1.pokemon.map((p) => ({
                          id: p.id,
                          tera: p.addons?.includes("Tera Captain") || false,
                          name: getName(p.id),
                          cost: tournament.tierList.getPokemonCost(
                            p.id,
                            p.addons,
                          ),
                        })),
                      },
                      side2: {
                        team: side2Team
                          ? {
                              name: side2Team.teamName,
                              coach: side2Team.coach.name,
                              logo: side2Team.logo,
                            }
                          : undefined,
                        pokemon: trade.side2.pokemon.map((p) => ({
                          id: p.id,
                          tera: p.addons?.includes("Tera Captain") || false,
                          name: getName(p.id),
                          cost: tournament.tierList.getPokemonCost(
                            p.id,
                            p.addons,
                          ),
                        })),
                      },
                      activeStage: trade.activeStage,
                    };
                  }),
              );
              const stages: {
                name: string;
                trades: {
                  side1: {
                    team?: {
                      name: string;
                      coach: string;
                      logo?: string;
                    };
                    pokemon: {
                      id: string;
                      tera: boolean;
                    }[];
                  };
                  side2: {
                    team?: {
                      name: string;
                      coach: string;
                      logo?: string;
                    };
                    pokemon: {
                      id: string;
                      tera: boolean;
                    }[];
                  };
                  activeStage: number;
                }[];
              }[] = [
                // { name: "Pre-Season", trades: [] },
                ...ctx.division.stages.map((stage) => ({
                  name: stage.name,
                  trades: [],
                })),
              ];

              trades.forEach((trade) => {
                stages[trade.activeStage].trades.push(trade);
              });

              return { stages };
            });
          });
          r.path("teams")((r) => {
            r.param("team_id", async (ctx, team_id) => {
              const team = await LeagueTeamModel.findById(team_id).populate<{
                coach: LeagueCoachDocument;
              }>("coach");
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
        r
          .path("divisions")
          .use((ctx) => rolecheck(ctx.tournament, "organizer"))((r) => {
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
                );

                if (!team)
                  throw new PDZError(ErrorCodes.TEAM.NOT_IN_DIVISION, {
                    teamId,
                  });
                await draftPokemon(ctx.tournament, ctx.division, team, pick);
                return { message: "Draft pick set successfully." };
              });
            });
            r.path("schedule")((r) => {
              r.get(async (ctx) => {
                const matchups = await LeagueMatchupModel.find({
                  division: ctx.division._id,
                }).populate<
                  LeagueMatchupDocument & {
                    side1: { team: PopulatedLeagueTeamDocument };
                    side2: { team: PopulatedLeagueTeamDocument };
                    division: LeagueDivisionDocument;
                  }
                >([
                  {
                    path: "side1.team",
                    populate: {
                      path: "coach",
                    },
                  },
                  {
                    path: "side2.team",
                    populate: {
                      path: "coach",
                    },
                  },
                  "division",
                ]);

                const matchupsByStage = new Map<string, typeof matchups>();
                for (const matchup of matchups) {
                  const stageKey = matchup.round!.toString();
                  const bucket = matchupsByStage.get(stageKey);
                  if (bucket) {
                    bucket.push(matchup);
                  } else {
                    matchupsByStage.set(stageKey, [matchup]);
                  }
                }

                const stages = ctx.division.stages.map((stage, index) => {
                  const matchups =
                    matchupsByStage.get(stage._id.toString()) ?? [];
                  const transformedMatchups = matchups.map((matchup) => ({
                    id: matchup._id.toString(),
                    team1: {
                      name: matchup.side1.team.teamName,
                      coach: matchup.side1.team.coach.name,
                      score: matchup.side1.score,
                      logo: matchup.side1.team.logo,
                      id: matchup.side1.team._id.toString(),
                      draft: getRosterByStage(
                        matchup.side1.team,
                        matchup.division,
                        index,
                      ).map((pokemon) => ({
                        id: pokemon.id,
                        capt: {
                          ...(pokemon.addons?.includes("Tera Captain")
                            ? { tera: true }
                            : undefined),
                        },
                      })),
                    },
                    team2: {
                      name: matchup.side2.team.teamName,
                      coach: matchup.side2.team.coach.name,
                      score: matchup.side2.score,
                      logo: matchup.side2.team.logo,
                      id: matchup.side2.team._id.toString(),
                      draft: getRosterByStage(
                        matchup.side2.team,
                        matchup.division,
                        index,
                      ).map((pokemon) => ({
                        id: pokemon.id,
                        capt: {
                          ...(pokemon.addons?.includes("Tera Captain")
                            ? { tera: true }
                            : undefined),
                        },
                      })),
                    },
                    matches: matchup.results.map((result) => ({
                      link: result.replay,
                      team1: {
                        team: Object.fromEntries(
                          result.side1.pokemon.entries(),
                        ),
                        score: result.side1.score,
                        winner: result.winner === "side1",
                      },
                      team2: {
                        team: Object.fromEntries(
                          result.side2.pokemon.entries(),
                        ),
                        score: result.side2.score,
                        winner: result.winner === "side2",
                      },
                    })),
                    score: {
                      team1: matchup.side1.score,
                      team2: matchup.side2.score,
                    },
                    winner: matchup.forfeit
                      ? matchup.winner === "side1"
                        ? "side1ffw"
                        : matchup.winner === "side2"
                          ? "side2ffw"
                          : "dffl"
                      : matchup.winner,
                  }));
                  return {
                    _id: stage._id,
                    name: stage.name,
                    matchups: transformedMatchups,
                  };
                });

                return { stages, currentStage: ctx.division.currentStage };
              });
              r.param("matchup_id", (ctx, matchup_id) => {
                if (!isValidObjectId(matchup_id))
                  throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
                    reason: "Invalid matchup ID",
                  });
                return { matchup_id };
              })((r) => {
                r.post.validate({
                  body: (data) =>
                    z
                      .object({
                        score: z
                          .object({
                            team1: z.number(),
                            team2: z.number(),
                          })
                          .optional(),
                        winner: z
                          .enum([
                            "side1",
                            "side2",
                            "draw",
                            "side1ffw",
                            "side2ffw",
                            "dffl",
                          ])
                          .optional(),
                        matches: z.array(
                          z.object({
                            link: z.string().optional(),
                            winner: z.enum(["side1", "side2", "draw"]),
                            team1: z.object({
                              score: z.number(),
                              pokemon: z.record(
                                z.string(),
                                matchupPokemonStatsSchema,
                              ),
                            }),
                            team2: z.object({
                              score: z.number(),
                              pokemon: z.record(
                                z.string(),
                                matchupPokemonStatsSchema,
                              ),
                            }),
                          }),
                        ),
                      })
                      .parse(data),
                })(async (ctx) => {
                  const matchup = await LeagueMatchupModel.findOne({
                    _id: ctx.matchup_id,
                    division: ctx.division._id,
                  });

                  if (!matchup)
                    throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, {
                      matchupId: ctx.matchup_id,
                    });

                  matchup.results = ctx.validatedBody.matches.map((match) => ({
                    replay: match.link?.trim() || undefined,
                    winner: match.winner,
                    side1: {
                      score: match.team1.score,
                      pokemon: new Map(
                        Object.entries(match.team1.pokemon).filter(
                          ([id, stats]) =>
                            stats.status !== null && stats.status !== undefined,
                        ) as [string, PokemonStats][],
                      ),
                    },
                    side2: {
                      score: match.team2.score,
                      pokemon: new Map(
                        Object.entries(match.team2.pokemon).filter(
                          ([id, stats]) =>
                            stats.status !== null && stats.status !== undefined,
                        ) as [string, PokemonStats][],
                      ),
                    },
                  }));

                  if (ctx.validatedBody.score) {
                    matchup.side1.score = ctx.validatedBody.score.team1;
                    matchup.side2.score = ctx.validatedBody.score.team2;
                  }

                  if (ctx.validatedBody.winner) {
                    if (
                      ctx.validatedBody.winner === "side1" ||
                      ctx.validatedBody.winner === "side2" ||
                      ctx.validatedBody.winner === "draw"
                    ) {
                      matchup.winner = ctx.validatedBody.winner;
                    } else if (ctx.validatedBody.winner === "side1ffw") {
                      matchup.winner = "side1";
                      matchup.forfeit = true;
                    } else if (ctx.validatedBody.winner === "side2ffw") {
                      matchup.winner = "side2";
                      matchup.forfeit = true;
                    } else if (ctx.validatedBody.winner === "dffl") {
                      matchup.winner = "draw";
                      matchup.forfeit = true;
                    }
                  }

                  await matchup.save();
                  return { message: "Schedule updated." };
                });
              });
            });
            r.path("trades")((r) => {
              r.get(async (ctx) => {
                const tournament = await ctx.tournament.populate<{
                  tierList: LeagueTierListDocument;
                }>("tierList");
                const division = await ctx.division.populate<{
                  trades: {
                    side1: {
                      team: LeagueTeamDocument & { coach: LeagueCoachDocument };
                      pokemon: DraftTrade["side1"]["pokemon"];
                    };
                    side2: {
                      team: LeagueTeamDocument & { coach: LeagueCoachDocument };
                      pokemon: DraftTrade["side2"]["pokemon"];
                    };
                    activeStage: number;
                    timestamp: Date;
                    status: "PENDING" | "APPROVED" | "REJECTED";
                  }[];
                }>([
                  {
                    path: "trades.side1.team",
                    populate: {
                      path: "coach",
                    },
                  },
                  {
                    path: "trades.side2.team",
                    populate: {
                      path: "coach",
                    },
                  },
                ]);
                const stages = division.stages.map((stage) => ({
                  name: stage.name,
                  trades: [] as {
                    side1: {
                      team?: {
                        id: string;
                        name: string;
                        coach: string;
                        logo?: string;
                      };
                      pokemon: {
                        name: string;
                        id: string;
                        cost: number;
                        tera?: boolean | undefined;
                      }[];
                    };
                    side2: {
                      team?: {
                        id: string;
                        name: string;
                        coach: string;
                        logo?: string;
                      };
                      pokemon: {
                        name: string;
                        id: string;
                        cost: number;
                        tera?: boolean | undefined;
                      }[];
                    };
                    activeStage: number;
                    timestamp: Date;
                    status: "PENDING" | "APPROVED" | "REJECTED";
                  }[],
                }));

                for (const trade of division.trades) {
                  if (
                    trade.activeStage < 0 ||
                    trade.activeStage >= stages.length
                  )
                    continue;
                  stages[trade.activeStage].trades.push({
                    side1: {
                      team: trade.side1.team
                        ? {
                            id: trade.side1.team._id.toString(),
                            name: trade.side1.team.teamName,
                            coach: trade.side1.team.coach.name,
                            logo: trade.side1.team.logo,
                          }
                        : undefined,
                      pokemon: trade.side1.pokemon.map((p) => {
                        const cost = tournament.tierList.getPokemonCost(p.id);
                        return {
                          id: p.id,
                          name: getName(p.id),
                          cost: cost || 0,
                          tera: p.addons?.includes("Tera Captain") || false,
                        };
                      }),
                    },
                    side2: {
                      team: trade.side2.team
                        ? {
                            id: trade.side2.team._id.toString(),
                            name: trade.side2.team.teamName,
                            coach: trade.side2.team.coach.name,
                            logo: trade.side2.team.logo,
                          }
                        : undefined,
                      pokemon: trade.side2.pokemon.map((p) => {
                        const cost = tournament.tierList.getPokemonCost(p.id);
                        return {
                          id: p.id,
                          name: getName(p.id),
                          cost: cost || 0,
                          tera: p.addons?.includes("Tera Captain") || false,
                        };
                      }),
                    },
                    activeStage: trade.activeStage,
                    timestamp: trade.timestamp,
                    status: trade.status,
                  });
                }

                return { stages };
              });
              r.post.validate({
                body: (data) =>
                  z
                    .object({
                      side1: z.object({
                        team: z.string().min(1).optional(),
                        pokemon: z.array(
                          z.object({
                            id: z.string(),
                            tera: z.boolean(),
                          }),
                        ),
                      }),
                      side2: z.object({
                        team: z.string().min(1).optional(),
                        pokemon: z.array(
                          z.object({
                            id: z.string(),
                            tera: z.boolean(),
                          }),
                        ),
                      }),
                      stage: z.number(),
                    })
                    .parse(data),
              })(async (ctx) => {
                const { side1, side2, stage } = ctx.validatedBody;

                if (side1.team && !isValidObjectId(side1.team))
                  throw new PDZError(ErrorCodes.DIVISION.INVALID_TRADE, {
                    reason: "Invalid team ID for side1",
                  });
                if (side2.team && !isValidObjectId(side2.team))
                  throw new PDZError(ErrorCodes.DIVISION.INVALID_TRADE, {
                    reason: "Invalid team ID for side2",
                  });

                const side1Trade = {
                  team: side1.team ? new Types.ObjectId(side1.team) : undefined,
                  pokemon: side1.pokemon.map((p) => ({
                    id: p.id,
                    addons: p.tera ? ["Tera Captain"] : undefined,
                  })),
                };
                const side2Trade = {
                  team: side2.team ? new Types.ObjectId(side2.team) : undefined,
                  pokemon: side2.pokemon.map((p) => ({
                    id: p.id,
                    addons: p.tera ? ["Tera Captain"] : undefined,
                  })),
                };

                await makeTrade(ctx.division, side1Trade, side2Trade, stage);
                return {
                  message: "Trade processed successfully.",
                };
              });
            });
            r.path("pokemon-list")((r) => {
              r.get(async (ctx) => {
                await ctx.tournament.populate("tierList");
                const rawTierList = ctx.tournament.tierList;
                const tierList = await getTierList(ctx.tournament.tierList._id);
                const division = await ctx.division.populate<{
                  teams: (LeagueTeamDocument & {
                    coach: LeagueCoachDocument;
                  })[];
                }>({
                  path: "teams",
                  populate: {
                    path: "coach",
                  },
                });

                const drafted = division.teams
                  .map((team) => ({
                    team: {
                      name: team.teamName,
                      coachName: team.coach.name,
                      id: team._id.toString(),
                    },
                    roster: getRosterByStage(
                      team,
                      ctx.division,
                      ctx.division.currentStage,
                    ).map((pokemon) => {
                      const pokemonTier = rawTierList.pokemon.get(pokemon.id);
                      const tier = rawTierList.tiers.find(
                        (t) => t.name === pokemonTier?.tier,
                      );
                      return {
                        id: pokemon.id,
                        name: getName(pokemon.id),
                        setAddons: pokemon.addons,
                        addons: pokemonTier?.addons,
                        cost: tier?.cost,
                      };
                    }),
                  }))
                  .filter((team) => team.roster.length > 0);

                const undrafted = {
                  roster: tierList
                    .filter((tier) => tier.cost)
                    .flatMap((tier) =>
                      tier.pokemon
                        .filter(
                          (pokemon) =>
                            !drafted.some((team) =>
                              team.roster.some((p) => p.id === pokemon.id),
                            ),
                        )
                        .map((p) => ({
                          id: p.id,
                          name: p.name,
                          cost: tier.cost,
                          addons: p.addons,
                        })),
                    ),
                };
                const groups: {
                  roster: {
                    id: string;
                    name: string;
                    cost?: number;
                    addons?: TierListPokemonAddon[];
                    setAddons?: string[];
                  }[];
                  team?: {
                    name: string;
                    coachName: string;
                    id: string;
                  };
                }[] = [undrafted, ...drafted];
                return {
                  groups,
                  stages: ctx.division.stages.map((s) => s.name),
                  currentStage: ctx.division.currentStage,
                };
              });
              r.path("edit").auth()((r) => {
                r.get.validate({
                  query: (data) =>
                    z
                      .object({
                        division: z
                          .union([
                            z.string().min(1),
                            z.array(z.string().min(1)),
                          ])
                          .optional(),
                      })
                      .parse(data),
                })(async (ctx) => {
                  const { division } = ctx.validatedQuery;
                  const tierList = await getTierList(
                    ctx.tournament.tierList._id,
                    true,
                  );
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
                  await updateTierList(ctx.tournament.tierList._id, tiers);
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
          });
        });
        r.path("playoffs").use((ctx) => rolecheck(ctx.tournament, "organizer"))(
          (r) => {
            r.path("schedule")((r) => {
              r.get(async (ctx) => {
                const playoffsStage = ctx.tournament.stages?.find(
                  (s) => s.name === "Playoffs",
                );
                if (!playoffsStage) {
                  return { stages: [], currentStage: 0 };
                }

                const roundIds = playoffsStage.rounds.map((r) => r._id);
                const bracketMatchups = await LeagueMatchupModel.find({
                  round: { $in: roundIds },
                }).populate<
                  LeagueMatchupDocument & {
                    side1: { team: PopulatedLeagueTeamDocument };
                    side2: { team: PopulatedLeagueTeamDocument };
                  }
                >([
                  { path: "side1.team", populate: { path: "coach" } },
                  { path: "side2.team", populate: { path: "coach" } },
                ]);

                // Recursively resolve bracket side teams by following the slot chain
                const matchCache = new Map<
                  string,
                  LeagueMatchupDocument | null
                >();
                const teamCache = new Map<
                  string,
                  PopulatedLeagueTeamDocument | null
                >();

                const fetchMatch = async (id: string) => {
                  if (!matchCache.has(id)) {
                    matchCache.set(id, await LeagueMatchupModel.findById(id));
                  }
                  return matchCache.get(id)!;
                };

                const fetchTeam = async (id: string) => {
                  if (!teamCache.has(id)) {
                    const t = await LeagueTeamModel.findById(id).populate<{
                      coach: PopulatedLeagueTeamDocument["coach"];
                    }>("coach");
                    teamCache.set(id, t as PopulatedLeagueTeamDocument | null);
                  }
                  return teamCache.get(id)!;
                };

                type MatchSideRef = {
                  team?: Types.ObjectId | PopulatedLeagueTeamDocument;
                  slot?: {
                    type: string;
                    matchId?: string;
                    seed?: number;
                  } | null;
                };
                const resolveTeamRecursive = async (
                  side: MatchSideRef,
                  depth = 0,
                ): Promise<PopulatedLeagueTeamDocument | null> => {
                  if (side.team) {
                    const id =
                      (side.team as any)._id?.toString() ??
                      side.team.toString();
                    return fetchTeam(id);
                  }
                  if (!side.slot || side.slot.type === "seed" || depth > 8)
                    return null;
                  const { matchId, type } = side.slot as {
                    type: "winner" | "loser";
                    matchId: string;
                  };
                  if (!matchId) return null;
                  const prev = await fetchMatch(matchId);
                  if (!prev) return null;
                  let winnerSide = prev.winner as
                    | "side1"
                    | "side2"
                    | "draw"
                    | undefined;
                  if (!winnerSide && prev.results?.length > 0) {
                    const s1 = prev.results.filter(
                      (r) => r.winner === "side1",
                    ).length;
                    const s2 = prev.results.filter(
                      (r) => r.winner === "side2",
                    ).length;
                    if (s1 > s2) winnerSide = "side1";
                    else if (s2 > s1) winnerSide = "side2";
                    else winnerSide = "draw";
                  }
                  if (!winnerSide || winnerSide === "draw") return null;
                  const resolvedSide: "side1" | "side2" =
                    type === "winner"
                      ? winnerSide
                      : winnerSide === "side1"
                        ? "side2"
                        : "side1";
                  return resolveTeamRecursive(prev[resolvedSide], depth + 1);
                };

                await Promise.all(
                  bracketMatchups.flatMap((m) => [
                    (async () => {
                      if (
                        !m.side1.team &&
                        m.side1.slot &&
                        m.side1.slot.type !== "seed"
                      ) {
                        const resolved = await resolveTeamRecursive(
                          m.side1 as MatchSideRef,
                        );
                        if (resolved) (m as any).side1.team = resolved;
                      }
                    })(),
                    (async () => {
                      if (
                        !m.side2.team &&
                        m.side2.slot &&
                        m.side2.slot.type !== "seed"
                      ) {
                        const resolved = await resolveTeamRecursive(
                          m.side2 as MatchSideRef,
                        );
                        if (resolved) (m as any).side2.team = resolved;
                      }
                    })(),
                  ]),
                );

                const teamIds = [
                  ...new Set(
                    bracketMatchups
                      .filter((m) => m.side1.team || m.side2.team)
                      .flatMap((m) => [
                        m.side1.team?._id.toString(),
                        m.side2.team?._id.toString(),
                      ])
                      .filter(Boolean) as string[],
                  ),
                ].map((id) => new Types.ObjectId(id));

                const divisions = await LeagueDivisionModel.find({
                  tournament: ctx.tournament._id,
                  teams: { $in: teamIds },
                });
                const teamToDivision = new Map<
                  string,
                  LeagueDivisionDocument
                >();
                divisions.forEach((div) => {
                  div.teams.forEach((teamId) => {
                    teamToDivision.set(teamId.toString(), div);
                  });
                });

                const matchupsByRound = new Map<
                  string,
                  typeof bracketMatchups
                >();
                for (const matchup of bracketMatchups) {
                  const key = matchup.round?.toString() ?? "";
                  const bucket = matchupsByRound.get(key) ?? [];
                  bucket.push(matchup);
                  matchupsByRound.set(key, bucket);
                }

                const stages = playoffsStage.rounds.map((round) => {
                  const roundMatchups =
                    matchupsByRound.get(round._id.toString()) ?? [];
                  const transformedMatchups = roundMatchups.map((matchup) => {
                    const side1Division = matchup.side1.team
                      ? teamToDivision.get(matchup.side1.team._id.toString())
                      : undefined;
                    const side2Division = matchup.side2.team
                      ? teamToDivision.get(matchup.side2.team._id.toString())
                      : undefined;
                    return {
                      id: matchup._id.toString(),
                      team1: matchup.side1.team
                        ? {
                            name: matchup.side1.team.teamName,
                            coach: matchup.side1.team.coach.name,
                            score: matchup.side1.score,
                            logo: matchup.side1.team.logo,
                            id: matchup.side1.team._id.toString(),
                            draft: side1Division
                              ? getRosterByStage(
                                  matchup.side1.team,
                                  side1Division,
                                ).map((p) => ({
                                  id: p.id,
                                  capt: p.addons?.includes("Tera Captain")
                                    ? { tera: true }
                                    : {},
                                }))
                              : [],
                          }
                        : null,
                      team2: matchup.side2.team
                        ? {
                            name: matchup.side2.team.teamName,
                            coach: matchup.side2.team.coach.name,
                            score: matchup.side2.score,
                            logo: matchup.side2.team.logo,
                            id: matchup.side2.team._id.toString(),
                            draft: side2Division
                              ? getRosterByStage(
                                  matchup.side2.team,
                                  side2Division,
                                ).map((p) => ({
                                  id: p.id,
                                  capt: p.addons?.includes("Tera Captain")
                                    ? { tera: true }
                                    : {},
                                }))
                              : [],
                          }
                        : null,
                      matches: matchup.results.map((result) => ({
                        link: result.replay,
                        team1: {
                          team: Object.fromEntries(
                            result.side1.pokemon.entries(),
                          ),
                          score: result.side1.score,
                          winner: result.winner === "side1",
                        },
                        team2: {
                          team: Object.fromEntries(
                            result.side2.pokemon.entries(),
                          ),
                          score: result.side2.score,
                          winner: result.winner === "side2",
                        },
                      })),
                      score: {
                        team1: matchup.side1.score,
                        team2: matchup.side2.score,
                      },
                      winner: matchup.forfeit
                        ? matchup.winner === "side1"
                          ? "side1ffw"
                          : matchup.winner === "side2"
                            ? "side2ffw"
                            : "dffl"
                        : matchup.winner,
                    };
                  });
                  return {
                    _id: round._id,
                    name: round.name,
                    matchups: transformedMatchups,
                  };
                });

                return { stages, currentStage: 0 };
              });
              r.param("matchup_id", (ctx, matchup_id) => {
                if (!isValidObjectId(matchup_id))
                  throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
                    reason: "Invalid matchup ID",
                  });
                return { matchup_id };
              })((r) => {
                r.post.validate({
                  body: (data) =>
                    z
                      .object({
                        score: z
                          .object({
                            team1: z.number(),
                            team2: z.number(),
                          })
                          .optional(),
                        winner: z
                          .enum([
                            "side1",
                            "side2",
                            "draw",
                            "side1ffw",
                            "side2ffw",
                            "dffl",
                          ])
                          .nullable()
                          .optional(),
                        matches: z.array(
                          z.object({
                            link: z.string().optional(),
                            winner: z.enum(["side1", "side2", "draw"]),
                            team1: z.object({
                              score: z.number(),
                              pokemon: z.record(
                                z.string(),
                                matchupPokemonStatsSchema,
                              ),
                            }),
                            team2: z.object({
                              score: z.number(),
                              pokemon: z.record(
                                z.string(),
                                matchupPokemonStatsSchema,
                              ),
                            }),
                          }),
                        ),
                      })
                      .parse(data),
                })(async (ctx) => {
                  const playoffsStage = ctx.tournament.stages?.find(
                    (s) => s.name === "Playoffs",
                  );
                  if (!playoffsStage)
                    throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, {
                      matchupId: ctx.matchup_id,
                    });

                  const roundIds = playoffsStage.rounds.map((r) => r._id);
                  const matchup = await LeagueMatchupModel.findOne({
                    _id: ctx.matchup_id,
                    round: { $in: roundIds },
                  });
                  if (!matchup)
                    throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, {
                      matchupId: ctx.matchup_id,
                    });

                  matchup.results = ctx.validatedBody.matches.map((match) => ({
                    replay: match.link?.trim() || undefined,
                    winner: match.winner,
                    side1: {
                      score: match.team1.score,
                      pokemon: new Map(
                        Object.entries(match.team1.pokemon).filter(
                          ([, stats]) =>
                            stats.status !== null && stats.status !== undefined,
                        ) as [string, PokemonStats][],
                      ),
                    },
                    side2: {
                      score: match.team2.score,
                      pokemon: new Map(
                        Object.entries(match.team2.pokemon).filter(
                          ([, stats]) =>
                            stats.status !== null && stats.status !== undefined,
                        ) as [string, PokemonStats][],
                      ),
                    },
                  }));

                  if (ctx.validatedBody.score) {
                    matchup.side1.score = ctx.validatedBody.score.team1;
                    matchup.side2.score = ctx.validatedBody.score.team2;
                  }

                  if (ctx.validatedBody.winner != null) {
                    if (
                      ctx.validatedBody.winner === "side1" ||
                      ctx.validatedBody.winner === "side2" ||
                      ctx.validatedBody.winner === "draw"
                    ) {
                      matchup.winner = ctx.validatedBody.winner;
                      matchup.forfeit = false;
                    } else if (ctx.validatedBody.winner === "side1ffw") {
                      matchup.winner = "side1";
                      matchup.forfeit = true;
                    } else if (ctx.validatedBody.winner === "side2ffw") {
                      matchup.winner = "side2";
                      matchup.forfeit = true;
                    } else if (ctx.validatedBody.winner === "dffl") {
                      matchup.winner = "draw";
                      matchup.forfeit = true;
                    }
                  }

                  await matchup.save();
                  return { message: "Playoff schedule updated." };
                });
              });
            });
          },
        );
        r.path("settings").use((ctx) => rolecheck(ctx.tournament, "organizer"))(
          (r) => {
            r.get(async (ctx) => {
              return {
                name: ctx.tournament.name,
                description: ctx.tournament.description,
                signUpDeadline: ctx.tournament.signUpDeadline,
                draftStart: ctx.tournament.draftStart,
                draftEnd: ctx.tournament.draftEnd,
                seasonStart: ctx.tournament.seasonStart,
                seasonEnd: ctx.tournament.seasonEnd,
                discord: ctx.tournament.discord,
                forfeit: ctx.tournament.forfeit,
                diffMode: ctx.tournament.diffMode,
              };
            });
            r.patch.validate({
              body: (data) =>
                z
                  .object({
                    name: z.string().min(1),
                    description: z.string().optional(),
                    signUpDeadline: z.coerce.date(),
                    draftStart: z.coerce.date().optional(),
                    draftEnd: z.coerce.date().optional(),
                    seasonStart: z.coerce.date().optional(),
                    seasonEnd: z.coerce.date().optional(),
                    discord: z.string().optional(),
                    forfeit: z
                      .object({
                        gameDiff: z.number().int().min(0),
                        pokemonDiff: z.number().int().min(0),
                      })
                      .optional(),
                    diffMode: z.enum(["pokemon", "game"]).optional(),
                  })
                  .parse(data),
            })(async (ctx) => {
              const {
                name,
                description,
                signUpDeadline,
                draftStart,
                draftEnd,
                seasonStart,
                seasonEnd,
                discord,
                forfeit,
                diffMode,
              } = ctx.validatedBody;
              ctx.tournament.name = name;
              ctx.tournament.description = description;
              ctx.tournament.signUpDeadline = signUpDeadline;
              ctx.tournament.draftStart = draftStart;
              ctx.tournament.draftEnd = draftEnd;
              ctx.tournament.seasonStart = seasonStart;
              ctx.tournament.seasonEnd = seasonEnd;
              ctx.tournament.discord = discord;
              if (forfeit !== undefined) ctx.tournament.forfeit = forfeit;
              if (diffMode !== undefined) ctx.tournament.diffMode = diffMode;
              await ctx.tournament.save();
              logger.info(
                `Tournament settings updated for ${ctx.tournament.tournamentKey} by ${ctx.sub}`,
              );
              return { message: "Tournament settings updated." };
            });
          },
        );
      });
    });
  });
  r.param("league_key", async (ctx, league_key) => {
    const league = await LeagueModel.findOne({ leagueKey: league_key });
    if (!league)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
        leagueKey: league_key,
      });
    return { league };
  })((r) => {
    r.get(async (ctx) => {
      const tournaments = await LeagueTournamentModel.find({
        league: ctx.league._id,
      })
        .populate<{
          tierList: LeagueTierListDocument;
        }>("tierList")
        .sort({ createdAt: -1 });

      return {
        name: ctx.league.name,
        leagueKey: ctx.league.leagueKey,
        description: ctx.league.description,
        logo: ctx.league.logo,
        tournaments: tournaments.map((t) => ({
          name: t.name,
          tournamentKey: t.tournamentKey,
          description: t.description,
          format: t.tierList.format,
          ruleset: t.tierList.ruleset,
          signUpDeadline: t.signUpDeadline,
          draftStart: t.draftStart,
          draftEnd: t.draftEnd,
          seasonStart: t.seasonStart,
          seasonEnd: t.seasonEnd,
          logo: t.logo,
          discord: t.discord,
        })),
      };
    });
    r.path("tournaments").auth()((r) => {
      r.param("tournament_key", async (ctx, tournament_key) => {
        const tournament = await LeagueTournamentModel.findOne({
          tournamentKey: tournament_key,
          league: ctx.league._id,
        }).populate("tierList");
        if (!tournament)
          throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, {
            tournamentKey: tournament_key,
          });
        return { tournament };
      })((r) => {
        // r.path("discord")((r) => {
        //   r.path("joined").auth()((r) => {
        //     r.param("discord_id", (ctx, discord_id) => {
        //       if (!/^\d{17,20}$/.test(discord_id))
        //         throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        //           reason: "Invalid Discord ID format",
        //         });
        //       return { discord_id };
        //     })((r) => {
        //       r.get(async (ctx) => {
        //         return (await checkDiscordMembership([ctx.discord_id]))[0]
        //           .joined;
        //       });
        //     });
        //   });
        // });
      });
    });
  });
});
