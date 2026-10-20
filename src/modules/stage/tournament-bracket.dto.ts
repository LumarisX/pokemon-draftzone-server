import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { STAGE_TYPE_VALUES } from "./stage.schema";
import {
  BracketSlotDto,
  SeedGroupDto,
  UpdateBracketRoundDto,
} from "./stage.dto";

export class StageEntrantDto {
  @IsIn(["team", "place", "open"])
  kind!: "team" | "place" | "open";

  @IsString()
  @IsOptional()
  teamId?: string;

  @IsString()
  @IsOptional()
  sourceStageKey?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  place?: number;
}

export class TournamentBracketStageDto {
  @IsString()
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(STAGE_TYPE_VALUES)
  type!: string;

  @IsBoolean()
  @IsOptional()
  public?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedGroupDto)
  @IsOptional()
  seedGroups?: SeedGroupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageEntrantDto)
  @IsOptional()
  entrants?: StageEntrantDto[];
}

export class TournamentBracketMatchDto {
  @IsString()
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  stageKey!: string;

  @IsNumber()
  roundIndex!: number;

  @IsNumber()
  @IsOptional()
  position?: number;

  @IsString()
  @IsOptional()
  label?: string;

  @ValidateNested()
  @Type(() => BracketSlotDto)
  a!: BracketSlotDto;

  @ValidateNested()
  @Type(() => BracketSlotDto)
  b!: BracketSlotDto;
}

export class UpdateTournamentBracketDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBracketRoundDto)
  rounds!: UpdateBracketRoundDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentBracketStageDto)
  stages!: TournamentBracketStageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentBracketMatchDto)
  matches!: TournamentBracketMatchDto[];

  @IsNumber()
  @IsOptional()
  currentRoundIndex?: number;
}

export class SeedAssignmentDto {
  @IsInt()
  @Min(1)
  seed!: number;

  @IsString()
  teamId!: string;
}

export class ConfirmStageSeedsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedAssignmentDto)
  seeds!: SeedAssignmentDto[];
}
