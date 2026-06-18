import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsObject,
  IsBoolean,
  IsEmail,
  IsOptional,
} from "class-validator";

export class UserSettingsDto {
  @IsBoolean()
  @IsOptional()
  shinyUnlock?: boolean;

  @IsString()
  @IsOptional()
  spriteSet?: string;

  @IsString()
  @IsOptional()
  theme?: string;

  @IsString()
  @IsOptional()
  ldMode?: string;

  @IsString()
  @IsOptional()
  themeOverride?: string;
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
  settings!: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsBoolean()
  emailVerified!: boolean;

  @IsString()
  @IsOptional()
  picture?: string;
}
