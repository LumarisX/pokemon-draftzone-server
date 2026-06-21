import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { Injectable, Logger } from "@nestjs/common";
import { EmbedBuilder, TextChannel } from "discord.js";
import { Types } from "mongoose";
import {
  client,
  findDiscordMemberInIndex,
  getDiscordMemberInGuild,
  getDiscordMemberIndex,
} from "../../../../discord";
import { isOwnedBy } from "@modules/coach/coach.domain";
import { CoachRepository } from "@modules/coach/coach.repository";
import { DraftRepository } from "@modules/draft/draft.repository";
import { StageRepository } from "@modules/stage/stage.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import FileUploadModel from "../../../../models/file-upload.model";
import { s3Service } from "../../../../services/s3.service";
import {
  CoachAssignmentDto,
  RuleSectionDto,
  SignUpDto,
  UpdateCoachLogoDto,
} from "./hosted-tournament.dto";
import { HostedTournament, TournamentRule } from "./hosted-tournament.domain";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentRepository } from "./hosted-tournament.repository";

const DISCORD_GUILD_ID = "1183936734719922176";
const SIGNUP_COACH_ROLE_ID = "1469151649070186576";
const SIGNUP_CHANNEL_ID = "1303896194187132978";

@Injectable()
export class HostedTournamentService {
  private readonly logger = new Logger(HostedTournamentService.name);

  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
    private readonly draftRepo: DraftRepository,
    private readonly stageRepo: StageRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  async getTournament(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    return HostedTournamentMapper.toClientPayload(tournament);
  }

  async getInfo(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    const tierList = await this.tierListRepo.findById(tournament.tierListId);

    const drafts = await this.draftRepo.findPublicByTournament(
      tournament.id,
    );

    return {
      name: tournament.name,
      tournamentKey: tournament.tournamentKey,
      description: tournament.description,
      format: tierList.format,
      ruleset: tierList.ruleset,
      signUpDeadline: tournament.signUpDeadline,
      draftStart: tournament.draftStart,
      draftEnd: tournament.draftEnd,
      seasonStart: tournament.seasonStart,
      seasonEnd: tournament.seasonEnd,
      logo: tournament.logo,
      drafts: drafts.map((draft) => ({
        draftKey: draft.draftKey,
        name: draft.name,
      })),
      discord: tournament.discord,
      tierListId: tournament.tierListId,
    };
  }

  async getBracket(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    const playoffsStage = tournament.getPlayoffsStage();

    if (!playoffsStage) {
      return { format: null, teams: [], rounds: [], matches: [] };
    }

    const roundIds = playoffsStage.rounds.map((round) => round._id.toString());
    const bracketMatchups = await this.matchupRepo.findByRounds(roundIds);

    // Brackets now only ever belong to a single Stage (the resolved
    // playoffsStage), so there's no longer a need to resolve a per-matchup
    // or per-team "divisionKey" the way the old code resolved multiple
    // divisions across matchups/teams. The team list comes straight from
    // this stage's own pools.
    const teamObjIds = this.stageRepo.flattenPoolTeamIds(playoffsStage);

    const teamDocs = await this.teamRepo.findManyByIds(teamObjIds);

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
          teamId: teamDoc._id.toString(),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const roundIdToName = new Map(
      playoffsStage.rounds.map((round) => [round._id.toString(), round.name]),
    );

    const matches = bracketMatchups.map((matchup) => ({
      _id: matchup._id.toString(),
      round: matchup.round?.toString() ?? null,
      roundName: matchup.round
        ? roundIdToName.get(matchup.round.toString()) ?? null
        : null,
      a: matchup.side1.slot
        ? {
            type: matchup.side1.slot.type,
            ...(matchup.side1.slot.type === "seed"
              ? { seed: matchup.side1.slot.seed }
              : { from: (matchup.side1.slot as { matchId: string }).matchId }),
          }
        : null,
      b: matchup.side2.slot
        ? {
            type: matchup.side2.slot.type,
            ...(matchup.side2.slot.type === "seed"
              ? { seed: matchup.side2.slot.seed }
              : { from: (matchup.side2.slot as { matchId: string }).matchId }),
          }
        : null,
      winner:
        matchup.winner === "side1"
          ? 0
          : matchup.winner === "side2"
            ? 1
            : undefined,
      replay: matchup.results?.[0]?.replay,
    }));

    const rounds = playoffsStage.rounds.map((round) => ({
      _id: round._id.toString(),
      name: round.name,
      matchDeadline: round.matchDeadline ?? null,
    }));

    return {
      format: playoffsStage.type,
      teams: teamsArray,
      rounds,
      matches,
    };
  }

  async getRoles(
    leagueKey: string,
    tournamentKey: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    return tournament.getRoles(sub);
  }

  /** Finds the coach + team belonging to `sub` within this tournament, if any. A person may have signed up for other tournaments too, each producing its own Coach/Team pair. */
  private async findSignupForTournament(sub: string, tournamentId: string) {
    const coaches = await this.coachRepo.findByAuth0Id(sub);
    for (const coach of coaches) {
      const team = await this.teamRepo.findByIdOrNull(coach.teamId);
      if (team && team.tournamentId.toString() === tournamentId) {
        return { coach, team };
      }
    }
    return null;
  }

  async getSignup(leagueKey: string, tournamentKey: string, sub: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);

    const signup = await this.findSignupForTournament(sub, tournament.id);
    if (!signup)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, {
        tournamentId: tournament.id,
      });
    const { coach, team } = signup;

    let draft: { draftKey: string; name: string } | null = null;
    if (team.draftId) {
      const d = await this.draftRepo.findById(team.draftId);
      if (d) draft = { draftKey: d.draftKey, name: d.name };
    }

    const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);
    const member = memberIndex
      ? findDiscordMemberInIndex(memberIndex, coach.discordName)
      : await getDiscordMemberInGuild(DISCORD_GUILD_ID, coach.discordName);
    const inDiscordServer = Boolean(member);

    return {
      name: coach.name,
      gameName: coach.gameName,
      discordName: coach.discordName,
      timezone: coach.timezone,
      teamName: team.teamName,
      status: team.status,
      logo: team.logo,
      signedUpAt: coach.signedUpAt,
      teamId: team._id.toString(),
      draft,
      inDiscordServer,
    };
  }

  async createSignup(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    dto: SignUpDto,
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);

    if (dto.droppedBefore && !dto.droppedWhy.trim()) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "droppedWhy",
      });
    }
    if (!dto.confirm) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: "confirm",
      });
    }

    const existing = await this.findSignupForTournament(sub, tournament.id);
    if (existing)
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_SIGNED_UP, {
        tournamentId: tournament.id,
      });

    // Pre-generate both ids so Team.coach and Coach.teamId (both required)
    // can be set correctly on first insert, with neither side left dangling.
    const coachId = new Types.ObjectId();
    const teamId = new Types.ObjectId();

    await this.teamRepo.create({
      _id: teamId,
      tournamentId: tournament.id,
      coach: coachId,
      teamName: dto.teamName,
      logo: dto.logo,
      status: "pending",
    });

    const leagueCoach = await this.coachRepo.create({
      _id: coachId,
      auth0Id: sub,
      name: dto.name,
      gameName: dto.gameName,
      discordName: dto.discordName,
      timezone: dto.timezone,
      teamId,
      experience: dto.experience,
      droppedBefore: dto.droppedBefore,
      droppedWhy: dto.droppedWhy,
      confirmed: dto.confirm,
    });

    await this.notifySignup(tournament, dto);

    return {
      message: "Sign up successful.",
      userId: leagueCoach._id.toString(),
      tournamentId: tournament.id,
    };
  }

  /**
   * Organizers/owners get the full admin roster view (Discord membership,
   * dropped reason, draft assignment); everyone else gets the minimal
   * public-safe shape. One endpoint instead of a separate "manage" copy.
   */
  async getCoaches(
    leagueKey: string,
    tournamentKey: string,
    sub: string | undefined,
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    const teams = await this.teamRepo.findAllByTournament(tournament.id);

    if (!tournament.isOrganizer(sub)) {
      return teams.map((team) => ({
        id: team.coach._id.toString(),
        teamName: team.teamName,
        coachName: team.coach.name,
        logo: team.logo,
        status: team.status,
      }));
    }

    const draftIds = teams
      .filter((team) => team.draftId)
      .map((team) => team.draftId!);
    const drafts = await this.draftRepo.findManyByIds(draftIds);
    const draftIdToKey = new Map(
      drafts.map((d) => [d._id.toString(), d.draftKey]),
    );
    const memberIndex = await getDiscordMemberIndex(DISCORD_GUILD_ID);

    const signups = await Promise.all(
      teams.map(async (team) => {
        const coach = team.coach;
        const draft = team.draftId
          ? draftIdToKey.get(team.draftId.toString())
          : undefined;
        const member = memberIndex
          ? findDiscordMemberInIndex(memberIndex, coach.discordName)
          : await getDiscordMemberInGuild(DISCORD_GUILD_ID, coach.discordName);
        const inDiscordServer = Boolean(member);
        const hasDiscordRole = Boolean(
          member && member.roles.cache.has(SIGNUP_COACH_ROLE_ID),
        );
        return {
          id: coach._id.toString(),
          name: coach.name,
          gameName: coach.gameName,
          discordName: coach.discordName,
          timezone: coach.timezone,
          experience: coach.experience,
          dropped: coach.droppedBefore ? coach.droppedWhy : undefined,
          status: team.status,
          teamName: team.teamName,
          signedUpAt: coach.signedUpAt,
          logo: team.logo ? s3Service.getPublicUrl(team.logo) : undefined,
          draft,
          inDiscordServer,
          hasDiscordRole,
        };
      }),
    );

    return {
      signups,
      drafts: drafts.map((d) => ({
        draftKey: d.draftKey,
        name: d.name,
      })),
    };
  }

  /** Bulk assign/move/remove coaches across drafts. Replaces the old POST /signup/manage. */
  async assignCoaches(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    assignments: CoachAssignmentDto[],
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    if (!tournament.isOrganizer(sub))
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const drafts = await this.draftRepo.findAllByTournament(
      tournament.id,
    );
    const draftsByKey = new Map(drafts.map((d) => [d.draftKey, d]));

    for (const assignment of assignments) {
      if (!Types.ObjectId.isValid(assignment.coachId)) continue;
      const coach = await this.coachRepo
        .findById(assignment.coachId)
        .catch(() => null);
      if (!coach) continue;

      const team = await this.teamRepo.findByIdOrNull(coach.teamId);
      if (!team || team.tournamentId.toString() !== tournament.id) continue;

      if (!assignment.divisionKey) {
        await this.teamRepo.update(team._id, { draftId: null });
        continue;
      }

      const targetDraft = draftsByKey.get(assignment.divisionKey);
      if (!targetDraft)
        throw new PDZError(ErrorCodes.DRAFT.NOT_IN_LEAGUE, {
          draftKey: assignment.divisionKey,
          tournamentKey: tournament.tournamentKey,
        });

      await this.teamRepo.update(team._id, {
        draftId: targetDraft._id,
      });
    }

    return { message: "Update successful." };
  }

  async getCoach(leagueKey: string, tournamentKey: string, coachId: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach) throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    return {
      id: coach._id.toString(),
      teamName: team.teamName,
      coachName: coach.name,
      logo: team.logo,
      status: team.status,
    };
  }

  async setCoachLogo(
    leagueKey: string,
    tournamentKey: string,
    coachId: string,
    sub: string,
    dto: UpdateCoachLogoDto,
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    if (!Types.ObjectId.isValid(coachId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { coachId });

    const coach = await this.coachRepo.findById(coachId).catch(() => null);
    if (!coach) throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.LEAGUE.COACH_NOT_FOUND, { coachId });

    const isOrganizer = tournament.isOrganizer(sub);
    const isSelf = isOwnedBy(coach, sub);
    if (!isOrganizer && !isSelf) throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);

    const uploadRecord = await FileUploadModel.findOne({
      key: dto.fileKey,
      uploadedBy: sub,
      uploadType: "league-logo",
      status: "confirmed",
    });
    if (!uploadRecord) throw new PDZError(ErrorCodes.FILE.NOT_FOUND);

    await this.teamRepo.update(team._id, { logo: dto.fileKey });

    await FileUploadModel.findOneAndUpdate(
      { key: dto.fileKey },
      { relatedEntityId: team._id.toString() },
    );

    return { message: "Logo updated.", logo: dto.fileKey };
  }

  async getRules(leagueKey: string, tournamentKey: string) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    return tournament.rules;
  }

  async updateRules(
    leagueKey: string,
    tournamentKey: string,
    sub: string,
    ruleSections: RuleSectionDto[],
  ) {
    const tournament = await this.tournamentRepo.findByKey(leagueKey, tournamentKey);
    if (!tournament.isOrganizer(sub)) {
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    }

    const rules = ruleSections.map(
      (rule) => new TournamentRule({ title: rule.title, body: rule.body }),
    );
    await this.tournamentRepo.updateRules(tournamentKey, rules);
    return { message: "Rules updated successfully" };
  }

  private async notifySignup(tournament: HostedTournament, dto: SignUpDto) {
    if (!client) return;
    try {
      const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
      if (!guild) return;

      const discordName = dto.discordName?.trim();
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
          const role = guild.roles.cache.get(SIGNUP_COACH_ROLE_ID);
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
          }
        }
      }

      const channel = guild.channels.cache.get(
        SIGNUP_CHANNEL_ID,
      ) as TextChannel;
      if (channel && channel.isTextBased()) {
        const totalCoaches = await this.teamRepo.countByTournament(
          tournament.id,
        );

        const clamp = (value: string, limit: number) =>
          value.length > limit ? `${value.slice(0, limit - 3)}...` : value;

        const embed = new EmbedBuilder()
          .setTitle(clamp(dto.name, 256))
          .setColor("#2F80ED")
          .setTimestamp(new Date())
          .addFields(
            { name: "Team Name", value: dto.teamName, inline: true },
            { name: "In-Game Name", value: dto.gameName, inline: true },
            { name: "Discord Name", value: dto.discordName, inline: true },
            { name: "Timezone", value: dto.timezone, inline: true },
            {
              name: "Experience",
              value: clamp(dto.experience, 1024),
              inline: false,
            },
          );

        if (dto.logo && s3Service.isEnabled()) {
          embed.setImage(s3Service.getPublicUrl(dto.logo));
        }

        channel.send({
          content: `There's a new sign up for **${tournament.name}**! Total sign ups: ${totalCoaches}`,
          embeds: [embed],
        });
      }
    } catch (discordError) {
      this.logger.warn("Failed to send Discord notification", discordError);
    }
  }
}
