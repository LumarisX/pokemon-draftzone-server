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

/**
 * Names the side that leaves a match whose recorded result cannot.
 *
 * `null` withdraws the decision and puts the bracket back on the result, so
 * the field is nullable rather than merely optional — omitting it and clearing
 * it are different requests.
 */
export class SetMatchupAdvancementDto {
  @IsIn(["side1", "side2", "none", null])
  advances!: "side1" | "side2" | "none" | null;
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

  /** Set alongside `winner` to report a forfeit rather than played games. */
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

/**
 * One block of the bracket's seeding. Groups own consecutive seed numbers in
 * array order — group 0 gets seeds 1..n, group 1 the n following, and so on —
 * and each resolves independently, so a random group is shuffled only among
 * its own teams and never leaks a team into another section.
 */
export class SeedGroupDto {
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];

  @IsIn(["certified-random", "manual"])
  method!: "certified-random" | "manual";

  /** Section name, recorded on the seeding log entry this group produces. */
  @IsString()
  @IsOptional()
  label?: string;
}
