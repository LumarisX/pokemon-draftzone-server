import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class DraftPickDto {
  @IsString()
  @MinLength(1)
  pokemonId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addons?: string[];
}

export class DraftDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DraftPickDto)
  add?: DraftPickDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  remove?: string[];

  @IsArray()
  @IsOptional()
  picks?: DraftPickDto[][];
}

export class SetPicksDto {
  @IsArray()
  picks!: DraftPickDto[][];
}

export class SetRoundPickDto {
  @IsString()
  @MinLength(1)
  pokemonId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addons?: string[];
}

export class SetDraftStateDto {
  @IsString()
  @MinLength(1)
  state!: string;
}

export class SetDraftTimerDto {
  @IsBoolean()
  noTimer!: boolean;
}

/** Both indices are zero-based, matching `calculateCurrentPick`. */
export class SetCurrentPickDto {
  @IsInt()
  @Min(0)
  round!: number;

  @IsInt()
  @Min(0)
  position!: number;
}

/**
 * Every field is optional so an organizer can save just what they changed.
 * `channelId: null` explicitly clears it (vs. `undefined`, which leaves it
 * untouched) — same convention as HostedTournament's `pointTotal`.
 */
export class UpdateDraftSettingsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  channelId?: string | null;

  @IsIn(["snake", "linear"])
  @IsOptional()
  orderProgression?: "snake" | "linear";

  @IsBoolean()
  @IsOptional()
  sequentialTurns?: boolean;

  @IsIn(["ALL", "SELF"])
  @IsOptional()
  visibility?: "ALL" | "SELF";

  @IsBoolean()
  @IsOptional()
  allowRemovals?: boolean;
}

/** `order` is required (and validated as a permutation of the draft's teams) when `useRandomSeeding` is false. */
export class SetDraftOrderDto {
  @IsBoolean()
  useRandomSeeding!: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  order?: string[];
}
