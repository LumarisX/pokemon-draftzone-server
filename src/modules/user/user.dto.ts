import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsObject,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsArray,
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
  discordName?: string | null;

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
