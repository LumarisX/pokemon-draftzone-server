import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import { isValidObjectId, Types } from "mongoose";
import { PostChatMessageDto } from "./chat.dto";
import {
  authorRoleOf,
  canReadChannel,
  canWriteChannel,
  channelNeedsTarget,
  ChatSettings,
  ChatViewer,
  isChannelEnabled,
} from "./chat.policy";
import { ChatRepository } from "./chat.repository";
import {
  CHAT_CHANNELS,
  ChatChannel,
  TournamentMessageDocument,
} from "./chat.schema";

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepo: ChatRepository,
    private readonly hostedTournamentRepo: HostedTournamentRepository,
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
    private readonly matchupRepo: LeagueMatchupRepository,
  ) {}

  async getMessages(
    leagueSlug: string,
    tournamentSlug: string,
    channel: ChatChannel,
    target: string | undefined,
    sub?: string,
  ) {
    const { tournament, room, viewer } = await this.resolveRoom(
      leagueSlug,
      tournamentSlug,
      channel,
      target,
      sub,
    );

    if (!canReadChannel(channel, room.target, viewer))
      throw new PDZError(ErrorCodes.CHAT.FORBIDDEN, { channel });

    const messages = await this.chatRepo.findByRoom({
      tournament: new Types.ObjectId(tournament.id),
      channel,
      target: room.target,
    });

    return {
      channel,
      target: room.target || undefined,
      canPost: canWriteChannel(channel, room.target, viewer),
      messages: messages.map((message) => this.toView(message, viewer)),
    };
  }

  async postMessage(
    leagueSlug: string,
    tournamentSlug: string,
    channel: ChatChannel,
    sub: string,
    dto: PostChatMessageDto,
  ) {
    const { tournament, room, viewer } = await this.resolveRoom(
      leagueSlug,
      tournamentSlug,
      channel,
      dto.target,
      sub,
    );

    if (!canWriteChannel(channel, room.target, viewer))
      throw new PDZError(ErrorCodes.CHAT.FORBIDDEN, { channel });

    const text = dto.text.trim();
    if (!text)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Message text is required",
      });

    const message = await this.chatRepo.create({
      tournament: new Types.ObjectId(tournament.id),
      channel,
      target: room.target,
      author: sub,
      authorName: viewer.authorName,
      authorRole: authorRoleOf(viewer),
      team: viewer.teamId ? new Types.ObjectId(viewer.teamId) : undefined,
      text,
    });

    return { message: this.toView(message, viewer) };
  }

  async deleteMessage(
    leagueSlug: string,
    tournamentSlug: string,
    messageId: string,
    sub: string,
  ) {
    if (!isValidObjectId(messageId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Invalid message ID",
      });

    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const message = await this.chatRepo.findById(messageId);
    if (!message || message.deletedAt)
      throw new PDZError(ErrorCodes.CHAT.MESSAGE_NOT_FOUND, { messageId });
    if (message.tournament.toString() !== tournament.id)
      throw new PDZError(ErrorCodes.CHAT.MESSAGE_NOT_FOUND, { messageId });

    const isOrganizer = this.isOrganizer(tournament, sub);
    if (!isOrganizer && message.author !== sub)
      throw new PDZError(ErrorCodes.CHAT.FORBIDDEN, { messageId });

    await this.chatRepo.softDelete(message._id, sub);
    return { message: "Message deleted." };
  }

  private chatSettings(tournament: HostedTournament): ChatSettings {
    return { matchupChat: tournament.matchSettings?.chat !== false };
  }

  private isOrganizer(tournament: HostedTournament, sub: string): boolean {
    return tournament.owner === sub || tournament.organizers.includes(sub);
  }

  private async resolveRoom(
    leagueSlug: string,
    tournamentSlug: string,
    channel: ChatChannel,
    target: string | undefined,
    sub?: string,
  ) {
    const tournament = await this.hostedTournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );

    if (!CHAT_CHANNELS.includes(channel))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Unknown chat channel",
        channel,
      });

    const settings = this.chatSettings(tournament);
    if (!isChannelEnabled(channel, settings))
      throw new PDZError(ErrorCodes.CHAT.DISABLED, { channel });

    const roomTarget = (target ?? "").trim();
    if (channelNeedsTarget(channel) && !roomTarget)
      throw new PDZError(ErrorCodes.CHAT.TARGET_REQUIRED, { channel });

    const viewer = await this.resolveViewer(
      tournament,
      channel,
      roomTarget,
      sub,
    );

    return {
      tournament,
      room: { target: channelNeedsTarget(channel) ? roomTarget : "" },
      viewer,
    };
  }

  private async resolveViewer(
    tournament: HostedTournament,
    channel: ChatChannel,
    target: string,
    sub?: string,
  ): Promise<ChatViewer & { authorName: string }> {
    const base = {
      sub,
      isOrganizer: sub ? this.isOrganizer(tournament, sub) : false,
      authorName: "Spectator",
    };

    const team = sub ? await this.findViewerTeam(tournament, sub) : null;
    const matchupTeamIds =
      channel === "matchup" ? await this.matchupTeamIds(target) : undefined;

    return {
      ...base,
      teamId: team?._id.toString(),
      draftId: team?.draftId?.toString(),
      matchupTeamIds,
      authorName: team?.coach.name ?? (base.isOrganizer ? "Organizer" : "Spectator"),
    };
  }

  private async findViewerTeam(tournament: HostedTournament, sub: string) {
    const coaches = await this.coachRepo.findByAuth0Id(sub);
    if (!coaches.length) return null;

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    return (
      teams.find((team) => team.tournamentId.toString() === tournament.id) ??
      null
    );
  }

  private async matchupTeamIds(matchupId: string): Promise<string[]> {
    if (!isValidObjectId(matchupId))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Invalid matchup ID",
      });

    const matchup = await this.matchupRepo.findByIdOrNull(matchupId);
    if (!matchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND, { matchupId });

    return [matchup.side1.team, matchup.side2.team]
      .filter((team): team is Types.ObjectId => !!team)
      .map((team) => team.toString());
  }

  private toView(
    message: TournamentMessageDocument,
    viewer: ChatViewer & { authorName?: string },
  ) {
    const isViewer = !!viewer.sub && message.author === viewer.sub;
    return {
      id: message._id.toString(),
      author: message.authorName,
      role: message.authorRole,
      teamId: message.team?.toString(),
      text: message.text,
      createdAt: message.createdAt,
      isViewer,
      canDelete: isViewer || viewer.isOrganizer,
    };
  }
}
