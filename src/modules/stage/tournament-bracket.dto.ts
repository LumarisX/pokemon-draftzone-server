import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  BracketSlotDto,
  SeedGroupDto,
  UpdateBracketRoundDto,
} from "./stage.dto";

/**
 * One stage of the tournament, as the builder holds it.
 *
 * `key` is the client's own handle, which `matches[].stageKey` points at. It
 * exists because a stage being created in this same request has no `_id` yet
 * and its matches still have to say they belong to it.
 */
export class TournamentBracketStageDto {
  /** Absent for a stage being created by this request. */
  @IsString()
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  key!: string;

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

  /** Omit to take the schema default (visible). */
  @IsBoolean()
  @IsOptional()
  public?: boolean;

  /**
   * This stage's own seeding. Seeds are numbered within the stage — seed 1
   * here and seed 1 of another stage are different teams — so each stage
   * carries its own groups and its own draw.
   *
   * Only accepted while the stage has never been seeded, or to *append*: the
   * existing seed order must appear as a prefix, and anything beyond it is
   * seeded manually. A certified-random draw happens once and is never re-run.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedGroupDto)
  @IsOptional()
  seedGroups?: SeedGroupDto[];
}

export class TournamentBracketMatchDto {
  /** Absent for a match being created by this request. */
  @IsString()
  @IsOptional()
  _id?: string;

  @IsString()
  @MinLength(1)
  key!: string;

  /** The `key` of the stage in this payload that owns the match. */
  @IsString()
  @MinLength(1)
  stageKey!: string;

  /** Index into `rounds` — the tournament-wide axis. */
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

/**
 * The full intended state of a tournament's bracket — its round axis, its
 * stages, and every match — applied as a diff against what is stored.
 *
 * Replaces the per-stage bracket endpoints. Rounds are shared by every stage,
 * so they cannot be edited from one stage without renumbering the others;
 * editing them together is the only coherent unit.
 *
 * Anything absent from `rounds`, `stages` or `matches` is deleted, so this is a
 * replace-with rather than a merge — but recorded results are never destroyed:
 * deleting a round, stage or match holding results is refused.
 */
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

  /** Index into `rounds`; omit to leave the current round where it is. */
  @IsNumber()
  @IsOptional()
  currentRoundIndex?: number;
}
