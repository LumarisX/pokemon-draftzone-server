import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
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
  @MaxLength(64)
  @IsOptional()
  teamId?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  sourceStageKey?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  place?: number;
}

export class TournamentBracketStageDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(STAGE_TYPE_VALUES)
  type!: string;

  @IsBoolean()
  @IsOptional()
  public?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SeedGroupDto)
  @IsOptional()
  seedGroups?: SeedGroupDto[];

  @IsArray()
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => StageEntrantDto)
  @IsOptional()
  entrants?: StageEntrantDto[];
}

export class TournamentBracketMatchDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  stageKey!: string;

  @IsInt()
  roundIndex!: number;

  @IsInt()
  @IsOptional()
  position?: number;

  @IsString()
  @MaxLength(100)
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
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateBracketRoundDto)
  rounds!: UpdateBracketRoundDto[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TournamentBracketStageDto)
  stages!: TournamentBracketStageDto[];

  @IsArray()
  @ArrayMaxSize(2000)
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
  @MaxLength(64)
  teamId!: string;
}

export class ConfirmStageSeedsDto {
  @IsArray()
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => SeedAssignmentDto)
  seeds!: SeedAssignmentDto[];
}
