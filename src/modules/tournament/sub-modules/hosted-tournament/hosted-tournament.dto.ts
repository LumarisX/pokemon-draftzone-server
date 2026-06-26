import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
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
