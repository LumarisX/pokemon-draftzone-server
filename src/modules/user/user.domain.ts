import { UserSettingsDto } from "./user.dto";
import { UserSettingsEntity } from "./user.schema";

export class UserSettings {
  shinyUnlock?: boolean;
  spriteSet?: string;
  theme?: string;
  ldMode?: string;
  themeOverride?: string;

  constructor(init?: Partial<UserSettings>) {
    Object.assign(this, init);
  }

  public toDatabasePayload(): UserSettingsEntity {
    return {
      shinyUnlock: this.shinyUnlock,
      spriteSet: this.spriteSet,
      theme: this.theme,
      ldMode: this.ldMode,
      themeOverride: this.themeOverride,
    };
  }

  public toClientPayload() {
    return {
      shinyUnlock: this.shinyUnlock ?? true,
      spriteSet: this.spriteSet ?? "home",
      theme: this.theme ?? "classic",
      ldMode: this.ldMode ?? "device",
      themeOverride: this.themeOverride || null,
    };
  }

  public static fromForm(dto: UserSettingsDto): UserSettings {
    return new UserSettings({
      shinyUnlock: dto.shinyUnlock,
      spriteSet: dto.spriteSet,
      theme: dto.theme,
      ldMode: dto.ldMode,
      themeOverride: dto.themeOverride,
    });
  }

  public static fromDatabase(doc: UserSettingsEntity): UserSettings {
    if (!doc) return new UserSettings();
    return new UserSettings({
      shinyUnlock: doc.shinyUnlock,
      spriteSet: doc.spriteSet,
      theme: doc.theme,
      ldMode: doc.ldMode,
      themeOverride: doc.themeOverride,
    });
  }
}
