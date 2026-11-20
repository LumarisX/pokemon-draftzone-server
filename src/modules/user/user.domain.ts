import { UserRole } from "./user.schema";

export class UserSettings {
  shinyUnlock?: boolean;
  spriteSet?: string;
  theme?: string;
  ldMode?: string;
  themeOverride?: string;

  constructor(init?: Partial<UserSettings>) {
    Object.assign(this, init);
  }
}

export class UserProfile {
  discordName?: string;
  gameName?: string;
  timezone?: string;

  constructor(init?: Partial<UserProfile>) {
    Object.assign(this, init);
  }
}

export interface UserDiscord {
  id: string;
  username: string;
  connectedAt: Date;
  refreshedAt: Date;
}

export class User {
  readonly sub: string;
  readonly signIn?: string;
  readonly profileId?: string;
  username?: string;
  displayName?: string;
  profile?: UserProfile;
  discord?: UserDiscord;
  privateProfile?: boolean;
  roles?: UserRole[];
  settings?: UserSettings;
  joined: Date;
  lastLogin: Date;
  lastCheckedAdsAt?: Date;
  constructor(props: {
    sub: string;
    signIn?: string;
    profileId?: string;
    joined: Date;
    lastLogin: Date;
    username?: string;
    displayName?: string;
    profile?: UserProfile;
    discord?: UserDiscord;
    privateProfile?: boolean;
    roles?: UserRole[];
    settings?: UserSettings;
    lastCheckedAdsAt?: Date;
  }) {
    this.discord = props.discord;
    this.sub = props.sub;
    this.signIn = props.signIn;
    this.profileId = props.profileId;
    this.username = props.username;
    this.displayName = props.displayName;
    this.profile = props.profile;
    this.privateProfile = props.privateProfile;
    this.roles = props.roles;
    this.settings = props.settings;
    this.joined = props.joined;
    this.lastLogin = props.lastLogin;
    this.lastCheckedAdsAt = props.lastCheckedAdsAt;
  }
}
