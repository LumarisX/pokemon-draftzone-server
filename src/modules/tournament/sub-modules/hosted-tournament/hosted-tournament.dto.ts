import { DraftCountDto } from "@modules/tier-list/tier-list.dto";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class SignUpDto {
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
  teamName!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @IsString()
  experience!: string;

  @IsBoolean()
  droppedBefore!: boolean;

  @IsString()
  droppedWhy!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  logo?: string;

  @IsBoolean()
  confirm!: boolean;
}

export class UpdateCoachLogoDto {
  @IsString()
  @MinLength(1)
  fileKey!: string;
}

export class CoachAssignmentDto {
  @IsString()
  @MinLength(1)
  coachId!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  divisionKey?: string | null;

  @IsIn(["approved", "pending", "denied"])
  @IsOptional()
  status?: "approved" | "pending" | "denied";
}

export class AssignCoachesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoachAssignmentDto)
  assignments!: CoachAssignmentDto[];
}

export class RuleSectionDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;
}

export class UpdateRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleSectionDto)
  ruleSections!: RuleSectionDto[];
}

export class TierRequirementDto {
  @IsString()
  @MinLength(1)
  tierName!: string;

  @IsInt()
  @Min(0)
  required!: number;
}

export class TournamentDiscordSettingsDto {
  @IsString()
  @IsOptional()
  guildId?: string;

  @IsString()
  @IsOptional()
  coachRoleId?: string;

  @IsString()
  @IsOptional()
  signUpChannelId?: string;
}

export class TournamentForfeitDto {
  @IsInt()
  @Min(0)
  gameDiff!: number;

  @IsInt()
  @Min(0)
  pokemonDiff!: number;
}

export class UpdateHostedTournamentSettingsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  signUpDeadline?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  draftStart?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  draftEnd?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  seasonStart?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  seasonEnd?: Date;

  @IsString()
  @IsOptional()
  discord?: string;

  @ValidateNested()
  @Type(() => TournamentDiscordSettingsDto)
  @IsOptional()
  discordSettings?: TournamentDiscordSettingsDto;

  @ValidateNested()
  @Type(() => TournamentForfeitDto)
  @IsOptional()
  forfeit?: TournamentForfeitDto;

  @IsIn(["pokemon", "game"])
  @IsOptional()
  diffMode?: "pokemon" | "game";

  @IsString()
  @MinLength(1)
  @IsOptional()
  tierListId?: string;

  @IsString()
  @IsOptional()
  format?: string;

  @IsString()
  @IsOptional()
  ruleset?: string;

  @ValidateNested()
  @Type(() => DraftCountDto)
  @IsOptional()
  draftCount?: DraftCountDto;

  @IsInt()
  @Min(0)
  @IsOptional()
  pointTotal?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierRequirementDto)
  @IsOptional()
  tierRequirements?: TierRequirementDto[];
}
