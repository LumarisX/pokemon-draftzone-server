import { Type } from "class-transformer";
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class BlankTierListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  format!: string;

  @IsString()
  @MinLength(1)
  ruleset!: string;
}

export class AttachTierListDto {
  @IsString()
  @IsOptional()
  tierListSlug?: string;

  @ValidateNested()
  @Type(() => BlankTierListDto)
  @IsOptional()
  blank?: BlankTierListDto;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  reason?: string;
}

export class SwapPreviewDto {
  @IsString()
  @MinLength(1)
  from!: string;
}

export class PullTierListDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsObject()
  @IsOptional()
  resolutions?: Record<string, "source" | "current">;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  reason?: string;
}

export class SaveAsPresetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export const RESOLUTION_CHOICES = ["source", "current"] as const;

export function cleanResolutions(
  resolutions: Record<string, unknown> | undefined,
): Record<string, "source" | "current"> {
  const clean: Record<string, "source" | "current"> = {};
  for (const [key, value] of Object.entries(resolutions ?? {}))
    if ((RESOLUTION_CHOICES as readonly unknown[]).includes(value))
      clean[key] = value as "source" | "current";
  return clean;
}
