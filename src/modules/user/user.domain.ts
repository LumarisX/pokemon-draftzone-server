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

export class User {
  readonly sub: string;
  username?: string;
  roles?: UserRole[];
  settings?: UserSettings;
  joined: Date;
  lastLogin: Date;
  lastCheckedAdsAt?: Date;
  constructor(props: {
    sub: string;
    joined: Date;
    lastLogin: Date;
    username?: string;
    roles?: UserRole[];
    settings?: UserSettings;
    lastCheckedAdsAt?: Date;
  }) {
    this.sub = props.sub;
    this.username = props.username;
    this.roles = props.roles;
    this.settings = props.settings;
    this.joined = props.joined;
    this.lastLogin = props.lastLogin;
    this.lastCheckedAdsAt = props.lastCheckedAdsAt;
  }
}
