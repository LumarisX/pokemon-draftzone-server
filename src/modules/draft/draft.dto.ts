import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PICKS_VISIBLE_TO, PicksVisibleTo } from "./domain/pick-visibility";

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
  @IsOptional()
  timerLength?: number;

  @IsDateString()
  @IsOptional()
  draftStart?: string | null;

  @IsDateString()
  @IsOptional()
  draftEnd?: string | null;

  @IsBoolean()
  @IsOptional()
  public?: boolean;
}

export class CreatePoolDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  @IsOptional()
  draftStart?: string;

  @IsDateString()
  @IsOptional()
  draftEnd?: string;

  @IsBoolean()
  @IsOptional()
  public?: boolean;
}

export class SetDraftOrderDto {
  @IsBoolean()
  useRandomSeeding!: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  order?: string[];
}
