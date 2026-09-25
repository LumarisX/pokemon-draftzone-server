import {
  POKEMON_STATUSES,
  PokemonResultStatus,
} from "@modules/matchup/sub-modules/league-matchup/league-matchup.schema";
import { plainToInstance, Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  ValidationOptions,
} from "class-validator";

export const MAX_GAMES_PER_MATCHUP = 15;
export const MAX_POKEMON_PER_SIDE = 30;
export const MAX_KILLS_PER_POKEMON = 20;

export class MatchupScoreDto {
  @IsInt()
  @Min(0)
  team1!: number;

  @IsInt()
  @Min(0)
  team2!: number;
}

export class PokemonKillsDto {
  @IsInt()
  @Min(0)
  @Max(MAX_KILLS_PER_POKEMON)
  @IsOptional()
  direct?: number;

  @IsInt()
  @Min(0)
  @Max(MAX_KILLS_PER_POKEMON)
  @IsOptional()
  indirect?: number;

  @IsInt()
  @Min(0)
  @Max(MAX_KILLS_PER_POKEMON)
  @IsOptional()
  teammate?: number;
}

export class PokemonResultDto {
  @IsIn(POKEMON_STATUSES)
  status!: PokemonResultStatus;

  @ValidateNested()
  @Type(() => PokemonKillsDto)
  @IsOptional()
  kills?: PokemonKillsDto;
}

function toPokemonResults(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return new Map(
    Object.entries(value)
      .filter(
        ([, stats]) =>
          !stats || typeof stats !== "object" || stats.status !== null,
      )
      .map(([id, stats]) => [id, plainToInstance(PokemonResultDto, stats)]),
  );
}

function IsPokemonResultMap(maxSize: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "isPokemonResultMap",
      validator: {
        validate: (value) => value instanceof Map && value.size <= maxSize,
        defaultMessage: (args) =>
          `${args?.property ?? "pokemon"} must be an object of at most ${maxSize} Pokémon`,
      },
    },
    options,
  );
}

export class MatchTeamResultDto {
  @IsInt()
  @Min(0)
  score!: number;

  @Transform(({ value }) => toPokemonResults(value))
  @IsPokemonResultMap(MAX_POKEMON_PER_SIDE)
  @ValidateNested({ each: true })
  pokemon!: Map<string, PokemonResultDto>;
}

export class MatchResultDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() || undefined : value,
  )
  @IsUrl(
    { protocols: ["https"], require_protocol: true },
    { message: "Replay links must be full https:// links" },
  )
  @MaxLength(500)
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
  @ArrayMaxSize(MAX_GAMES_PER_MATCHUP)
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
