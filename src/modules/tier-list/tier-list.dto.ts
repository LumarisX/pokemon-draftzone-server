import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
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
