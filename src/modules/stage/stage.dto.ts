import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

export class MatchupScoreDto {
  @IsNumber()
  team1!: number;

  @IsNumber()
  team2!: number;
}

export class MatchTeamResultDto {
  @IsNumber()
  score!: number;

  @IsObject()
  pokemon!: Record<
    string,
    {
      kills?: { direct?: number; indirect?: number; teammate?: number };
      status: "brought" | "survived" | "fainted" | null;
    }
  >;
}

export class MatchResultDto {
  @IsString()
  @IsOptional()
  link?: string;

  @IsIn(["side1", "side2", "draw"])
  winner!: "side1" | "side2" | "draw";

  @ValidateNested()
  @Type(() => MatchTeamResultDto)
  team1!: MatchTeamResultDto;

  @ValidateNested()
  @Type(() => MatchTeamResultDto)
  team2!: MatchTeamResultDto;
}

export class UpdateMatchupDto {
  @ValidateNested()
  @Type(() => MatchupScoreDto)
  @IsOptional()
  score?: MatchupScoreDto;

  @IsIn(["side1", "side2", "draw", "side1ffw", "side2ffw", "dffl"])
  @IsOptional()
  winner?: "side1" | "side2" | "draw" | "side1ffw" | "side2ffw" | "dffl";

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchResultDto)
  matches!: MatchResultDto[];
}

export class TradePokemonDto {
  @IsString()
  id!: string;

  @IsBoolean()
  tera!: boolean;
}

export class TradeSideDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  team?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradePokemonDto)
  pokemon!: TradePokemonDto[];
}

export class MakeTradeDto {
  @ValidateNested()
  @Type(() => TradeSideDto)
  side1!: TradeSideDto;

  @ValidateNested()
  @Type(() => TradeSideDto)
  side2!: TradeSideDto;

  @IsNumber()
  roundIndex!: number;
}

export class CreateStageRoundDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  matchDeadline?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  tradeDeadline?: Date;

  @IsNumber()
  @IsOptional()
  bestOf?: number;
}

export class CreateStageDto {
  @IsNumber()
  order!: number;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn([
    "round-robin",
    "single-elimination",
    "double-elimination",
    "swiss",
    "custom",
  ])
  type!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStageRoundDto)
  @IsOptional()
  rounds?: CreateStageRoundDto[];
}

export class SetStagePoolDto {
  @IsString()
  @MinLength(1)
  poolKey!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}

export class SetStagePoolsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetStagePoolDto)
  pools!: SetStagePoolDto[];
}

export class SetCurrentRoundDto {
  @IsNumber()
  currentRoundIndex!: number;
}

export class BracketSlotDto {
  @IsIn(["seed", "winner", "loser"])
  type!: "seed" | "winner" | "loser";

  @IsNumber()
  @IsOptional()
  seed?: number;

  @IsString()
  @IsOptional()
  from?: string;
}

export class BracketMatchDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsNumber()
  roundIndex!: number;

  @IsString()
  @IsOptional()
  section?: string;

  @IsNumber()
  @IsOptional()
  bracketRound?: number;

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

export class GenerateBracketDto {
  @IsIn(["certified-random", "manual"])
  seedingMethod!: "certified-random" | "manual";

  /**
   * Participant team ids. For "manual" this order IS the seeding (index 0 =
   * seed 1); for "certified-random" the order is ignored — the server
   * canonicalizes and shuffles.
   */
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStageRoundDto)
  rounds!: CreateStageRoundDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketMatchDto)
  matches!: BracketMatchDto[];
}
