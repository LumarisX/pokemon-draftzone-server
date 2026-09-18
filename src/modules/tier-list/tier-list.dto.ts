import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class DraftCountDto {
  @IsInt()
  @Min(0)
  min!: number;

  @IsInt()
  @Min(0)
  max!: number;
}

export class UpdateTierListSettingsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class TierListPokemonInputDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsBoolean()
  @IsOptional()
  banned?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bannedAbilities?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  formes?: string[];
}

export class TierListTierInputDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  name!: string;

  @IsInt()
  cost!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierListPokemonInputDto)
  pokemon!: TierListPokemonInputDto[];
}

export class UpdateTierListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierListTierInputDto)
  tiers!: TierListTierInputDto[];
}

export class BrowseTierListsDto {
  @IsIn(["mine", "public"])
  @IsOptional()
  scope?: "mine" | "public";

  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  format?: string;

  @IsString()
  @IsOptional()
  ruleset?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;
}

export class CreateTierListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  format!: string;

  @IsString()
  @MinLength(1)
  ruleset!: string;
}

export class ForkTierListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;
}
