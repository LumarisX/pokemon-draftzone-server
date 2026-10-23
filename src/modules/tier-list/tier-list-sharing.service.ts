import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { generateSlug } from "@core/slug";
import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListInviteRepository } from "./tier-list-invite.repository";
import { TierListRepository } from "./tier-list.repository";
import { TierListRole } from "./tier-list.schema";

export const TIER_LIST_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TIER_LIST_INVITE_LIMIT = 10;
const INVITE_TOKEN_LENGTH = 22;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function memberId(sub: string): string {
  return createHash("sha256").update(`tier-list-member:${sub}`).digest("hex").slice(0, 16);
}

@Injectable()
export class TierListSharingService {
  constructor(
    private readonly access: TierListAccessService,
    private readonly tierListRepo: TierListRepository,
    private readonly inviteRepo: TierListInviteRepository,
  ) {}

  private async preset(slug: string, sub: string | undefined, needed: "view" | "manage") {
    const resolved = await this.access.resolve(slug, sub, needed);
    if (resolved.tierList.isTournamentCopy)
      throw new PDZError(ErrorCodes.TIER_LIST.TOURNAMENT_COPY);
    return resolved.tierList;
  }

  async members(slug: string, sub: string) {
    const tierList = await this.preset(slug, sub, "view");
    const isOwner = tierList.createdBy === sub;
    const isMember = !!tierList.memberRole(sub);
    if (!isOwner && !isMember) throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);

    const invites = isOwner ? await this.inviteRepo.findOpen(tierList.id) : [];
    return {
      owner: { name: tierList.authorName ?? null, you: isOwner },
      members: tierList.members.map((member) => ({
        id: memberId(member.sub),
        name: member.name ?? null,
        role: member.role,
        you: member.sub === sub,
      })),
      invites: invites.map((invite) => ({
        id: invite._id.toString(),
        role: invite.role,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        uses: invite.acceptedBy.length,
      })),
      canManage: isOwner,
    };
  }

  async createInvite(
    slug: string,
    sub: string,
    input: { role: TierListRole; maxUses?: number },
  ) {
    const tierList = await this.preset(slug, sub, "manage");
    const open = await this.inviteRepo.countOpen(tierList.id);
    if (open >= TIER_LIST_INVITE_LIMIT)
      throw new PDZError(ErrorCodes.TIER_LIST.INVITE_LIMIT);

    const token = generateSlug(INVITE_TOKEN_LENGTH);
    const invite = await this.inviteRepo.create({
      tierListId: tierList.id,
      tokenHash: hashToken(token),
      role: input.role,
      createdBy: sub,
      expiresAt: new Date(Date.now() + TIER_LIST_INVITE_TTL_MS),
      maxUses: input.maxUses ?? 1,
    });
    return {
      id: invite._id.toString(),
      token,
      role: invite.role,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
    };
  }

  async revokeInvite(slug: string, sub: string, inviteId: string) {
    const tierList = await this.preset(slug, sub, "manage");
    if (!(await this.inviteRepo.revoke(tierList.id, inviteId)))
      throw new PDZError(ErrorCodes.TIER_LIST.INVITE_INVALID);
    return { message: "Invite revoked." };
  }

  async previewInvite(token: string, sub: string | undefined) {
    const invite = await this.inviteRepo.findOpenByHash(hashToken(token));
    if (!invite) throw new PDZError(ErrorCodes.TIER_LIST.INVITE_INVALID);
    const tierList = await this.tierListRepo.findById(invite.tierList.toString());
    return {
      tierList: {
        slug: tierList.slug,
        name: tierList.name,
        authorName: tierList.authorName ?? null,
        format: tierList.format.name,
        ruleset: tierList.ruleset.name,
      },
      role: invite.role,
      expiresAt: invite.expiresAt,
      alreadyMember:
        !!sub && (tierList.createdBy === sub || !!tierList.memberRole(sub)),
    };
  }

  async acceptInvite(token: string, sub: string, name: string) {
    const tokenHash = hashToken(token);
    const pending = await this.inviteRepo.findOpenByHash(tokenHash);
    if (!pending) throw new PDZError(ErrorCodes.TIER_LIST.INVITE_INVALID);
    const tierList = await this.tierListRepo.findById(pending.tierList.toString());
    if (tierList.createdBy === sub || tierList.memberRole(sub))
      return { slug: tierList.slug };

    const claimed = await this.inviteRepo.claim(tokenHash, sub);
    if (!claimed) throw new PDZError(ErrorCodes.TIER_LIST.INVITE_INVALID);

    const added = await this.tierListRepo.addMember(tierList.id, {
      sub,
      name: name.trim(),
      role: claimed.role,
    });
    if (!added) await this.inviteRepo.release(claimed._id, sub);
    return { slug: tierList.slug };
  }

  private findMember(
    tierList: { members: { sub: string; role: TierListRole; name?: string }[] },
    id: string,
  ) {
    const member = tierList.members.find((entry) => memberId(entry.sub) === id);
    if (!member)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { memberId: id });
    return member;
  }

  async setRole(slug: string, sub: string, id: string, role: TierListRole) {
    const tierList = await this.preset(slug, sub, "manage");
    const member = this.findMember(tierList, id);
    await this.tierListRepo.setMemberRole(tierList.id, member.sub, role);
    return { message: "Role updated." };
  }

  async removeMember(slug: string, sub: string, id: string) {
    const tierList = await this.preset(slug, sub, "view");
    const member = this.findMember(tierList, id);
    const leaving = member.sub === sub;
    if (!leaving && tierList.createdBy !== sub)
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    await this.tierListRepo.removeMember(tierList.id, member.sub);
    return { message: leaving ? "You left this tier list." : "Removed." };
  }

  async transfer(slug: string, sub: string, id: string) {
    const tierList = await this.preset(slug, sub, "manage");
    const member = this.findMember(tierList, id);
    if (member.role !== "editor")
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Only an editor can take over a tier list.",
      });
    const moved = await this.tierListRepo.transferOwnership(
      tierList.id,
      sub,
      member,
      tierList.authorName,
    );
    if (!moved) throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    return { message: "Ownership transferred." };
  }
}
