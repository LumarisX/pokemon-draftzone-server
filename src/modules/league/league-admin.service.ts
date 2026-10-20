import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { hashInviteToken } from "@modules/tournament/sub-modules/hosted-tournament/tournament-organizer.service";
import { Injectable } from "@nestjs/common";
import { leagueRole } from "./league-access";
import { LeagueAdminInviteRepository } from "./league-admin-invite.repository";
import { LeagueAdminInviteDocument } from "./league-admin-invite.schema";
import { LeagueRepository } from "./league.repository";
import { LeagueDocument } from "./league.schema";

export const LEAGUE_ADMIN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PENDING_LEAGUE_ADMIN_INVITES = 10;
const LEAGUE_ADMIN_INVITE_TOKEN_LENGTH = 32;

@Injectable()
export class LeagueAdminService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly inviteRepo: LeagueAdminInviteRepository,
  ) {}

  async getAdmins(leagueSlug: string, sub: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    if (!leagueRole(league, sub))
      throw new PDZError(ErrorCodes.LEAGUE.NOT_ADMIN, { leagueSlug });
    return this.adminsPayload(league, sub);
  }

  async createInvite(leagueSlug: string, sub: string, name: string) {
    const league = await this.requireOwner(leagueSlug, sub);

    const pending = await this.inviteRepo.countPendingByLeague(league._id);
    if (pending >= MAX_PENDING_LEAGUE_ADMIN_INVITES)
      throw new PDZError(ErrorCodes.LEAGUE.ADMIN_INVITE_LIMIT, {
        limit: MAX_PENDING_LEAGUE_ADMIN_INVITES,
      });

    const token = generateSlug(LEAGUE_ADMIN_INVITE_TOKEN_LENGTH);
    const invite = await this.inviteRepo.create({
      leagueId: league._id,
      tokenHash: hashInviteToken(token),
      name,
      createdBy: sub,
      expiresAt: new Date(Date.now() + LEAGUE_ADMIN_INVITE_TTL_MS),
    });

    return {
      ...(await this.adminsPayload(league, sub)),
      created: { id: invite._id.toString(), token },
    };
  }

  async revokeInvite(leagueSlug: string, sub: string, inviteId: string) {
    const league = await this.requireOwner(leagueSlug, sub);
    await this.inviteRepo.deletePending(league._id, inviteId);
    return this.adminsPayload(league, sub);
  }

  async removeAdmin(leagueSlug: string, sub: string, adminSub: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const isOwner = league.owner === sub;
    if (!isOwner && adminSub !== sub)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_OWNER, { leagueSlug });
    if (leagueRole(league, adminSub) !== "admin")
      throw new PDZError(ErrorCodes.LEAGUE.ADMIN_NOT_FOUND, { adminSub });

    await this.leagueRepo.removeAdmin(league._id, adminSub);
    if (!isOwner) return { left: true };
    return this.adminsPayload(
      await this.leagueRepo.findBySlug(leagueSlug),
      sub,
    );
  }

  async renameAdmin(
    leagueSlug: string,
    sub: string,
    adminSub: string,
    name: string,
  ) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    if (league.owner !== sub && adminSub !== sub)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_OWNER, { leagueSlug });
    if (leagueRole(league, adminSub) !== "admin")
      throw new PDZError(ErrorCodes.LEAGUE.ADMIN_NOT_FOUND, { adminSub });

    await this.leagueRepo.setAdminName(league._id, adminSub, name);
    return this.adminsPayload(
      await this.leagueRepo.findBySlug(leagueSlug),
      sub,
    );
  }

  async previewInvite(leagueSlug: string, sub: string, token: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const invite = await this.inviteRepo.findByTokenHash(
      hashInviteToken(token),
    );
    if (!invite || !this.isUsable(invite, league))
      throw new PDZError(ErrorCodes.LEAGUE.ADMIN_INVITE_INVALID);

    return {
      leagueName: league.name,
      suggestedName: invite.name,
      expiresAt: invite.expiresAt,
      alreadyAdmin: leagueRole(league, sub) !== null,
    };
  }

  async acceptInvite(
    leagueSlug: string,
    sub: string,
    token: string,
    name?: string,
  ) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const tokenHash = hashInviteToken(token);
    const invite = await this.inviteRepo.findByTokenHash(tokenHash);
    if (!invite || !this.isUsable(invite, league))
      throw new PDZError(ErrorCodes.LEAGUE.ADMIN_INVITE_INVALID);
    if (leagueRole(league, sub))
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_ADMIN);

    const claimed = await this.inviteRepo.claim(tokenHash, sub);
    if (!claimed) throw new PDZError(ErrorCodes.LEAGUE.ADMIN_INVITE_INVALID);

    const added = await this.leagueRepo
      .addAdmin(league._id, { sub, name: name ?? invite.name })
      .catch(async (error: unknown) => {
        await this.inviteRepo.release(claimed._id);
        throw error;
      });
    if (!added) {
      await this.inviteRepo.release(claimed._id);
      throw new PDZError(ErrorCodes.LEAGUE.ALREADY_ADMIN);
    }

    return { leagueSlug: league.slug };
  }

  private isUsable(
    invite: LeagueAdminInviteDocument,
    league: LeagueDocument,
  ): boolean {
    return (
      invite.leagueId.toString() === league._id.toString() &&
      !invite.acceptedAt &&
      invite.expiresAt.getTime() > Date.now()
    );
  }

  private async adminsPayload(league: LeagueDocument, sub: string) {
    const isOwner = league.owner === sub;
    const invites = isOwner
      ? await this.inviteRepo.findPendingByLeague(league._id)
      : [];

    return {
      canEdit: isOwner,
      ownerIsYou: isOwner,
      admins: (league.admins ?? []).map((admin) => ({
        sub: admin.sub,
        name: admin.name,
        isYou: admin.sub === sub,
      })),
      invites: invites.map((invite) => ({
        id: invite._id.toString(),
        name: invite.name,
        createdAt: invite.createdAt ?? null,
        expiresAt: invite.expiresAt,
      })),
    };
  }

  private async requireOwner(leagueSlug: string, sub: string) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    if (league.owner !== sub)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_OWNER, { leagueSlug });
    return league;
  }
}
