import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { CoachRepository } from "@modules/coach/coach.repository";
import { CoachDocument } from "@modules/coach/coach.schema";
import { TeamRepository } from "@modules/team/team.repository";
import { isActiveCoach } from "@modules/tournament/membership";
import {
  assertCan,
  can,
  isStaff,
} from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { Types } from "mongoose";
import { HostedTournament } from "./hosted-tournament.domain";
import {
  AddOrganizerDto,
  CreateOrganizerInviteDto,
} from "./hosted-tournament.dto";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { OrganizerInviteRepository } from "./organizer-invite.repository";
import { OrganizerInviteDocument } from "./organizer-invite.schema";

export const ORGANIZER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PENDING_ORGANIZER_INVITES = 10;
const ORGANIZER_INVITE_TOKEN_LENGTH = 32;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class TournamentOrganizerService {
  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly inviteRepo: OrganizerInviteRepository,
    private readonly teamRepo: TeamRepository,
    private readonly coachRepo: CoachRepository,
  ) {}

  async getOrganizers(leagueSlug: string, tournamentSlug: string, sub: string) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "viewStaff");
    return this.organizersPayload(tournament, sub);
  }

  async addOrganizer(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: AddOrganizerDto,
  ) {
    const tournament = await this.requireOwner(leagueSlug, tournamentSlug, sub);

    const coach = await this.coachInTournament(tournament.id, dto.coachId);
    if (!coach)
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_NOT_FOUND, {
        coachId: dto.coachId,
      });
    if (coach.auth0Id === tournament.owner)
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_IS_OWNER);

    await this.tournamentRepo.addStaff(tournament.id, {
      sub: coach.auth0Id,
      name: coach.name,
      role: "organizer",
    });
    return this.getOrganizers(leagueSlug, tournamentSlug, sub);
  }

  async renameOrganizer(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    organizerSub: string,
    name: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const isSelf = organizerSub === sub && isStaff(tournament, sub);
    if (!can(tournament, sub, "manageStaff") && !isSelf)
      throw new PDZError(ErrorCodes.AUTH.FORBIDDEN);
    if (!isStaff(tournament, organizerSub))
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_NOT_FOUND, {
        organizerSub,
      });

    if (organizerSub === tournament.owner)
      await this.tournamentRepo.setOwnerName(tournament.id, organizerSub, name);
    else
      await this.tournamentRepo.setStaffName(tournament.id, organizerSub, name);
    return this.getOrganizers(leagueSlug, tournamentSlug, sub);
  }

  async removeOrganizer(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    organizerSub: string,
  ) {
    const tournament = await this.requireOwner(leagueSlug, tournamentSlug, sub);
    if (organizerSub === tournament.owner)
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_IS_OWNER);

    await this.tournamentRepo.removeStaff(tournament.id, organizerSub);
    return this.getOrganizers(leagueSlug, tournamentSlug, sub);
  }

  async createInvite(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    dto: CreateOrganizerInviteDto,
  ) {
    const tournament = await this.requireOwner(leagueSlug, tournamentSlug, sub);

    const pending = await this.inviteRepo.countPendingByTournament(
      tournament.id,
    );
    if (pending >= MAX_PENDING_ORGANIZER_INVITES)
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_INVITE_LIMIT, {
        limit: MAX_PENDING_ORGANIZER_INVITES,
      });

    const token = generateSlug(ORGANIZER_INVITE_TOKEN_LENGTH);
    const invite = await this.inviteRepo.create({
      tournamentId: tournament.id,
      tokenHash: hashInviteToken(token),
      name: dto.name,
      createdBy: sub,
      expiresAt: new Date(Date.now() + ORGANIZER_INVITE_TTL_MS),
    });

    return {
      ...(await this.organizersPayload(tournament, sub)),
      created: { id: invite._id.toString(), token },
    };
  }

  async revokeInvite(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    inviteId: string,
  ) {
    const tournament = await this.requireOwner(leagueSlug, tournamentSlug, sub);
    await this.inviteRepo.deletePending(tournament.id, inviteId);
    return this.organizersPayload(tournament, sub);
  }

  async previewInvite(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    token: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const invite = await this.inviteRepo.findByTokenHash(
      hashInviteToken(token),
    );
    if (!invite || !this.isUsable(invite, tournament))
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_INVITE_INVALID);

    return {
      tournamentName: tournament.name,
      leagueName: tournament.leagueName,
      invitedBy: tournament.staffName(invite.createdBy),
      suggestedName: invite.name,
      expiresAt: invite.expiresAt,
      alreadyOrganizer: isStaff(tournament, sub),
    };
  }

  async acceptInvite(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    token: string,
    name?: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    const tokenHash = hashInviteToken(token);
    const invite = await this.inviteRepo.findByTokenHash(tokenHash);
    if (!invite || !this.isUsable(invite, tournament))
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_INVITE_INVALID);
    if (isStaff(tournament, sub))
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_ORGANIZER);

    const claimed = await this.inviteRepo.claim(tokenHash, sub);
    if (!claimed)
      throw new PDZError(ErrorCodes.LEAGUE.ORGANIZER_INVITE_INVALID);

    try {
      await this.tournamentRepo.addStaff(tournament.id, {
        sub,
        name: name ?? invite.name,
        role: "organizer",
      });
    } catch (error) {
      await this.inviteRepo.release(claimed._id);
      throw error;
    }

    return { tournamentSlug: tournament.slug };
  }

  private isUsable(
    invite: OrganizerInviteDocument,
    tournament: HostedTournament,
  ): boolean {
    return (
      invite.tournamentId.toString() === tournament.id &&
      !invite.acceptedAt &&
      invite.expiresAt.getTime() > Date.now()
    );
  }

  private async organizersPayload(tournament: HostedTournament, sub: string) {
    const canEdit = can(tournament, sub, "manageStaff");
    const organizerSubs = [
      tournament.owner,
      ...tournament.staff
        .map((member) => member.sub)
        .filter((staffSub) => staffSub !== tournament.owner),
    ];
    const [invites, candidates] = canEdit
      ? await Promise.all([
          this.inviteRepo.findPendingByTournament(tournament.id),
          this.promotableCoaches(tournament, new Set(organizerSubs)),
        ])
      : [[], []];

    return {
      canEdit,
      organizers: organizerSubs.map((organizerSub) => ({
        sub: organizerSub,
        name: tournament.staffName(organizerSub),
        isOwner: organizerSub === tournament.owner,
        isYou: organizerSub === sub,
      })),
      invites: invites.map((invite) => ({
        id: invite._id.toString(),
        name: invite.name,
        createdAt: invite.createdAt ?? null,
        expiresAt: invite.expiresAt,
      })),
      candidates,
    };
  }

  private async promotableCoaches(
    tournament: HostedTournament,
    excludedSubs: Set<string>,
  ) {
    const teams = await this.teamRepo.findAllByTournament(tournament.id);
    const bySub = new Map<
      string,
      { coachId: string; name: string; teamName: string }
    >();
    for (const team of teams) {
      for (const coach of team.coaches ?? []) {
        if (!isActiveCoach(coach) || excludedSubs.has(coach.auth0Id)) continue;
        if (bySub.has(coach.auth0Id)) continue;
        bySub.set(coach.auth0Id, {
          coachId: coach._id.toString(),
          name: coach.name,
          teamName: team.teamName,
        });
      }
    }
    return [...bySub.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private async requireOwner(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageStaff");
    return tournament;
  }

  private async coachInTournament(
    tournamentId: string,
    coachId: string,
  ): Promise<CoachDocument | null> {
    if (!Types.ObjectId.isValid(coachId)) return null;
    const coach = await this.coachRepo.findByIdOrNull(coachId);
    if (!coach || !isActiveCoach(coach)) return null;
    const team = await this.teamRepo.findByIdOrNull(coach.teamId);
    if (!team || team.tournamentId.toString() !== tournamentId) return null;
    return coach;
  }
}
