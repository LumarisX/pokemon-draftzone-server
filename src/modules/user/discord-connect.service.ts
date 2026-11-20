import { AppCacheService } from "@core/cache/app-cache.service";
import { CacheKeys } from "@core/cache/cache-keys";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { DiscordService } from "@modules/discord/discord.service";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { AccountMergeOfferService } from "./account-merge-offer.service";
import { DiscordNameSyncService } from "./discord-name-sync.service";
import { User } from "./user.domain";
import { discordIdFromSignIn, signInProvider } from "./user.identity";
import { UserRepository } from "./user.repository";

const STATE_TTL_MS = 10 * 60_000;
const REFRESH_AFTER_MS = 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RETURN_TO = "/settings";
const RETURN_TO_MAX = 512;
const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const ME_URL = "https://discord.com/api/users/@me";

interface PendingState {
  accountId: string;
  returnTo: string;
}

export interface DiscordIdentity {
  id: string;
  username: string;
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_RETURN_TO;
  if (value.length === 0 || value.length > RETURN_TO_MAX) return DEFAULT_RETURN_TO;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_RETURN_TO;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value))
    return DEFAULT_RETURN_TO;
  return value;
}

@Injectable()
export class DiscordConnectService {
  private readonly logger = new Logger(DiscordConnectService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly appCache: AppCacheService,
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly discordNameSync: DiscordNameSyncService,
    private readonly offers: AccountMergeOfferService,
  ) {}

  async startConnect(sub: string, returnTo?: string): Promise<{ url: string }> {
    const settings = this.settings();
    const user = await this.userRepository.getOrCreateUserBySub(sub, new Date());
    this.assertNotSignInDiscord(user);

    const state = randomBytes(24).toString("base64url");
    const pending: PendingState = {
      accountId: sub,
      returnTo: safeReturnTo(returnTo),
    };
    await this.appCache.set(CacheKeys.discordState(state), pending, STATE_TTL_MS);

    const params = new URLSearchParams({
      response_type: "code",
      scope: "identify",
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      state,
      prompt: "consent",
    });
    return { url: `${AUTHORIZE_URL}?${params.toString()}` };
  }

  async completeConnect(
    sub: string,
    code: string,
    state: string,
  ): Promise<{ user: User; returnTo: string }> {
    const settings = this.settings();
    const pending = await this.appCache.take<PendingState>(
      CacheKeys.discordState(state),
    );
    if (!pending || pending.accountId !== sub)
      throw new PDZError(ErrorCodes.USER.DISCORD_STATE_INVALID);

    const user = await this.userRepository.getOrCreateUserBySub(sub, new Date());
    this.assertNotSignInDiscord(user);

    const identity = await this.exchange(settings, code);

    const holder = await this.userRepository.findDiscordHolder(identity.id);
    if (holder && holder.accountId !== sub) {
      const mergeOffer = await this.offers.create(
        sub,
        holder.accountId,
        identity.id,
      );
      throw new PDZError(ErrorCodes.USER.DISCORD_ALREADY_CONNECTED, {
        heldBy: signInProvider(holder.signIn),
        ...(mergeOffer ? { mergeOffer } : {}),
      });
    }

    const now = new Date();
    const updated = await this.userRepository.applyChanges(sub, {
      set: {
        discord: {
          id: identity.id,
          username: identity.username,
          connectedAt: now,
          refreshedAt: now,
        },
      },
    });
    await this.appCache.invalidate(CacheKeys.user(sub));
    await this.discordNameSync.propagateToRunningSignUps(
      sub,
      identity.username,
      identity.id,
    );
    return { user: updated, returnTo: pending.returnTo };
  }

  async disconnect(sub: string): Promise<User> {
    const user = await this.userRepository.getOrCreateUserBySub(sub, new Date());
    if (discordIdFromSignIn(user.signIn ?? user.sub) !== null)
      throw new PDZError(ErrorCodes.USER.DISCORD_SIGN_IN_CANNOT_DISCONNECT);
    if (!user.discord) return user;

    const updated = await this.userRepository.applyChanges(sub, {
      unset: ["discord"],
    });
    await this.appCache.invalidate(CacheKeys.user(sub));
    await this.discordNameSync.clearRunningDiscordIds(sub);
    return updated;
  }

  async reconcile(sub: string, user: User): Promise<User> {
    try {
      let current = user;
      const signInId = discordIdFromSignIn(user.signIn ?? user.sub);
      if (!current.discord && signInId) {
        current = (await this.connectFromSignIn(sub, current, signInId)) ?? current;
      }
      if (current.discord && this.isStale(current.discord.refreshedAt)) {
        current = await this.refresh(sub, current);
      }
      return current;
    } catch (error) {
      this.logger.warn(`Could not reconcile Discord for ${sub}`, error);
      return user;
    }
  }

  private async connectFromSignIn(
    sub: string,
    user: User,
    discordId: string,
  ): Promise<User | null> {
    const holder = await this.userRepository.findDiscordHolder(discordId);
    if (holder && holder.accountId !== sub) return null;

    const username = user.profile?.discordName ?? user.username ?? discordId;
    const updated = await this.userRepository.applyChanges(sub, {
      set: {
        discord: {
          id: discordId,
          username,
          connectedAt: new Date(),
          refreshedAt: new Date(0),
        },
      },
    });
    await this.appCache.invalidate(CacheKeys.user(sub));
    await this.discordNameSync.propagateToRunningSignUps(sub, username, discordId);
    return updated;
  }

  private async refresh(sub: string, user: User): Promise<User> {
    const discord = user.discord;
    if (!discord) return user;
    const found = await this.discordService.fetchUser(discord.id);
    if (!found) {
      this.logger.warn(`Discord refresh for ${sub} found no user`);
      return user;
    }

    const changed = found.username !== discord.username;
    const updated = await this.userRepository.applyChanges(sub, {
      set: {
        "discord.username": found.username,
        "discord.refreshedAt": new Date(),
      },
    });
    await this.appCache.invalidate(CacheKeys.user(sub));
    if (changed) {
      await this.discordNameSync.propagateToRunningSignUps(
        sub,
        found.username,
        discord.id,
      );
    }
    return updated;
  }

  private isStale(refreshedAt: Date | undefined): boolean {
    if (!refreshedAt) return true;
    return Date.now() - new Date(refreshedAt).getTime() > REFRESH_AFTER_MS;
  }

  private assertNotSignInDiscord(user: User): void {
    if (discordIdFromSignIn(user.signIn ?? user.sub) !== null)
      throw new PDZError(ErrorCodes.USER.DISCORD_ALREADY_CONNECTED, {
        heldBy: "discord",
      });
  }

  private settings(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.config.get<string>("DISCORD_CLIENT_ID");
    const clientSecret = this.config.get<string>("DISCORD_CLIENT_SECRET");
    const redirectUri = this.config.get<string>("DISCORD_OAUTH_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri)
      throw new PDZError(ErrorCodes.USER.DISCORD_NOT_CONFIGURED);
    return { clientId, clientSecret, redirectUri };
  }

  private async exchange(
    settings: { clientId: string; clientSecret: string; redirectUri: string },
    code: string,
  ): Promise<DiscordIdentity> {
    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: settings.redirectUri,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!tokenResponse.ok) throw new Error(`token ${tokenResponse.status}`);
      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("no access token");

      const meResponse = await fetch(ME_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!meResponse.ok) throw new Error(`me ${meResponse.status}`);
      const me = (await meResponse.json()) as { id?: unknown; username?: unknown };
      if (typeof me.id !== "string" || typeof me.username !== "string")
        throw new Error("unexpected profile");
      return { id: me.id, username: me.username };
    } catch (error) {
      this.logger.warn("Discord code exchange failed", error);
      throw new PDZError(ErrorCodes.USER.DISCORD_EXCHANGE_FAILED);
    }
  }
}
