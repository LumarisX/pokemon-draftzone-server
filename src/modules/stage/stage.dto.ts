import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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

export class SetMatchupAdvancementDto {
  @IsIn(["side1", "side2", "none", null])
  advances!: "side1" | "side2" | "none" | null;
}

export class SetMatchupScheduleDto {
  @Transform(({ value }) => (value === "" ? null : value))
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  scheduledDate!: string | null;
}

export class SetMatchupNotesDto {
  @IsString()
  @MaxLength(20000)
  @IsOptional()
  notes?: string;
}

export class SubmitMatchupReportDto {
  @ValidateNested()
  @Type(() => MatchupScoreDto)
  @IsOptional()
  score?: MatchupScoreDto;

  @IsIn(["side1", "side2", "draw"])
  @IsOptional()
  winner?: "side1" | "side2" | "draw";

  @IsBoolean()
  @IsOptional()
  forfeit?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchResultDto)
  matches!: MatchResultDto[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  side1Paste?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  side2Paste?: string;
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

  @IsNumber()
  @Min(0)
  @IsOptional()
  tradePoints?: number;
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

export class UpdateTradeDto {
  @IsIn(["APPROVED", "REJECTED"])
  @IsOptional()
  status?: "APPROVED" | "REJECTED";

  @IsNumber()
  @Min(0)
  @IsOptional()
  activeRound?: number;
}

export class UpdateBracketRoundDto {
  @IsString()
  @IsOptional()
  _id?: string;

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

export class SeedGroupDto {
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];

  @IsIn(["certified-random", "manual"])
  method!: "certified-random" | "manual";

  @IsString()
  @IsOptional()
  label?: string;
}
