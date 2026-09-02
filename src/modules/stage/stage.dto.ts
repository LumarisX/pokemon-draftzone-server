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

export class SetTradeStatusDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";
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

  /** Omit to take the schema default (visible). */
  @IsBoolean()
  @IsOptional()
  public?: boolean;
}

export class UpdateStageDto {
  @IsBoolean()
  public!: boolean;
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

export class BracketSectionDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsIn(["main", "winners", "losers", "finals", "round-robin"])
  @IsOptional()
  kind?: "main" | "winners" | "losers" | "finals" | "round-robin";

  @IsString()
  @IsOptional()
  label?: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsNumber()
  @IsOptional()
  teamCount?: number;

  /** Pool whose standings table this section feeds. */
  @IsString()
  @IsOptional()
  poolKey?: string;

  @IsObject()
  @IsOptional()
  roundTitles?: Record<number, string>;
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

export class GenerateBracketDto {
  /**
   * Per-section seeding. Preferred over the flat seedingMethod/teamIds pair,
   * which remains accepted as the single-group form.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedGroupDto)
  @IsOptional()
  seedGroups?: SeedGroupDto[];

  @IsIn(["certified-random", "manual"])
  @IsOptional()
  seedingMethod?: "certified-random" | "manual";

  /**
   * Participant team ids. For "manual" this order IS the seeding (index 0 =
   * seed 1); for "certified-random" the order is ignored — the server
   * canonicalizes and shuffles.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  teamIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStageRoundDto)
  rounds!: CreateStageRoundDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketSectionDto)
  @IsOptional()
  sections?: BracketSectionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketMatchDto)
  matches!: BracketMatchDto[];
}

/**
 * A round that may already exist. `_id` identifies a round to keep — matchups
 * reference rounds by subdocument id, so an edit that drops the id would
 * orphan every matchup scheduled in that round.
 */
export class UpdateBracketRoundDto extends CreateStageRoundDto {
  @IsString()
  @IsOptional()
  _id?: string;
}

/** A match that may already exist. `_id` identifies a matchup to update. */
export class UpdateBracketMatchDto extends BracketMatchDto {
  @IsString()
  @IsOptional()
  _id?: string;
}

/**
 * The full intended state of a stage's bracket, applied as a diff against
 * what is already stored. Anything absent from `rounds` or `matches` is
 * deleted, so this is a replace-with, not a merge — but recorded results are
 * never destroyed: deleting a round or match that has results is refused.
 */
export class UpdateBracketDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBracketRoundDto)
  rounds!: UpdateBracketRoundDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketSectionDto)
  @IsOptional()
  sections?: BracketSectionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBracketMatchDto)
  matches!: UpdateBracketMatchDto[];

  /**
   * Only accepted while the stage has never been seeded, or to *append*
   * teams: the existing seed order must appear as a prefix, and anything
   * beyond it is seeded manually. A certified-random draw happens once and
   * is never re-run.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedGroupDto)
  @IsOptional()
  seedGroups?: SeedGroupDto[];
}
