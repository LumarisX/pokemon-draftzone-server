import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCoachDto {
  @IsString()
  @MinLength(1)
  teamId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  gameName!: string;

  @IsString()
  @MinLength(1)
  discordName!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @IsString()
  experience!: string;

  @IsBoolean()
  droppedBefore!: boolean;

  @IsString()
  droppedWhy!: string;

  @IsBoolean()
  confirm!: boolean;
}

export class UpdateCoachDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  gameName?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  discordName?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  experience?: string;

  @IsBoolean()
  @IsOptional()
  droppedBefore?: boolean;

  @IsString()
  @IsOptional()
  droppedWhy?: string;
}
