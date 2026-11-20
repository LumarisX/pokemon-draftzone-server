import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsObject,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
} from "class-validator";

export class UserSettingsDto {
  @IsBoolean()
  @IsOptional()
  shinyUnlock?: boolean;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  spriteSet?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  theme?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  ldMode?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  themeOverride?: string;
}

export class UpdateProfileDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  displayName?: string | null;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  gameName?: string | null;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  timezone?: string | null;

  @IsBoolean()
  @IsOptional()
  privateProfile?: boolean;
}

export class DiscordConnectDto {
  @IsString()
  @MaxLength(512)
  @IsOptional()
  returnTo?: string;
}

export class DiscordCallbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  state!: string;
}

export class MergeAccountsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @IsIn(["current", "other"])
  keep!: "current" | "other";
}

export class Auth0UserDto {
  @IsString()
  @IsNotEmpty()
  auth0Sub!: string;

  @IsDateString()
  lastLogin!: string;

  @IsDateString()
  joined!: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  username?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;

  @IsString()
  @IsOptional()
  picture?: string;
}
