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
  settings?: UserSettings;
  joined: Date;
  lastLogin: Date;

  constructor(props: {
    sub: string;
    joined: Date;
    lastLogin: Date;
    settings?: UserSettings;
  }) {
    this.sub = props.sub;
    this.settings = props.settings;
    this.joined = props.joined;
    this.lastLogin = props.lastLogin;
  }
}
