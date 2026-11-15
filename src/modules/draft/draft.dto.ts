import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PICKS_VISIBLE_TO, PicksVisibleTo } from "./domain/pick-visibility";

export class DraftPickDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pokemonId!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  addons?: string[];
}

export class DraftDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DraftPickDto)
  add?: DraftPickDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  remove?: string[];

  @IsArray()
  @ArrayMaxSize(60)
  @IsOptional()
  picks?: DraftPickDto[][];
}

export class SetPicksDto {
  @IsArray()
  @ArrayMaxSize(60)
  picks!: DraftPickDto[][];
}

export class SetRoundPickDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pokemonId!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  addons?: string[];
}

export const DRAFT_STATE_ACTIONS = [
  "play",
  "pause",
  "reopen",
  "finish",
] as const;
export type DraftStateAction = (typeof DRAFT_STATE_ACTIONS)[number];

export function isDraftStateAction(value: string): value is DraftStateAction {
  return (DRAFT_STATE_ACTIONS as readonly string[]).includes(value);
}

export class SetDraftStateDto {
  @IsIn(DRAFT_STATE_ACTIONS)
  state!: DraftStateAction;
}

export class SetDraftTimerDto {
  @IsBoolean()
  noTimer!: boolean;
}

export class SetCurrentPickDto {
  @IsInt()
  @Min(0)
  round!: number;

  @IsInt()
  @Min(0)
  position!: number;
}

export class UpdateDraftSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @Matches(/^\d{17,20}$/, { message: "channelId must be a Discord ID" })
  @IsOptional()
  channelId?: string | null;

  @IsIn(["snake", "linear"])
  @IsOptional()
  orderProgression?: "snake" | "linear";

  @IsBoolean()
  @IsOptional()
  sequentialTurns?: boolean;

  @IsIn(PICKS_VISIBLE_TO)
  @IsOptional()
  picksVisibleTo?: PicksVisibleTo;

  @IsBoolean()
  @IsOptional()
  allowDuplicates?: boolean;

  @IsBoolean()
  @IsOptional()
  allowRemovals?: boolean;

  @IsInt()
  @Min(1)
  @Max(60 * 60 * 24 * 14)
  @IsOptional()
  timerLength?: number;

  @IsDateString()
  @IsOptional()
  draftStart?: string | null;

  @IsDateString()
  @IsOptional()
  draftEnd?: string | null;
}

export class CreatePoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsDateString()
  @IsOptional()
  draftStart?: string;

  @IsDateString()
  @IsOptional()
  draftEnd?: string;
}

export class SetDraftOrderDto {
  @IsBoolean()
  useRandomSeeding!: boolean;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  order?: string[];
}
