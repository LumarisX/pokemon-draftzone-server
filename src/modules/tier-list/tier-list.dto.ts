import { Type } from "class-transformer";
import {
  ArrayMaxSize,
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
import {
  TIER_LIST_ROLES,
  TIER_LIST_VISIBILITIES,
  TierListRole,
  TierListVisibility,
} from "./tier-list.schema";

export const MAX_TAGS = 8;

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
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @IsOptional()
  authorName?: string;

  @IsIn(TIER_LIST_VISIBILITIES)
  @IsOptional()
  visibility?: TierListVisibility;

  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(24, { each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  format?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  ruleset?: string;
}

export class TierListPokemonInputDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsBoolean()
  @IsOptional()
  banned?: boolean;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  bannedAbilities?: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  formes?: string[];
}

export class TierListTierInputDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  id?: string;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsInt()
  @Min(-999)
  @Max(9999)
  cost!: number;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TierListPokemonInputDto)
  pokemon!: TierListPokemonInputDto[];
}

export class UpdateTierListDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TierListTierInputDto)
  tiers!: TierListTierInputDto[];

  @IsInt()
  @Min(0)
  @IsOptional()
  version?: number;

  @IsIn(["edit", "import"])
  @IsOptional()
  kind?: "edit" | "import";

  @IsString()
  @MaxLength(300)
  @IsOptional()
  reason?: string;
}

export class BrowseTierListsDto {
  @IsIn(["mine", "shared", "public", "featured"])
  @IsOptional()
  scope?: "mine" | "shared" | "public" | "featured";

  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  format?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  ruleset?: string;

  @IsString()
  @MaxLength(24)
  @IsOptional()
  tag?: string;

  @IsString()
  @MaxLength(60)
  @IsOptional()
  pokemon?: string;

  @IsIn(["updated", "forks", "uses", "name"])
  @IsOptional()
  sort?: "updated" | "forks" | "uses" | "name";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
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
  @MaxLength(64)
  format!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ruleset!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @IsOptional()
  authorName?: string;

  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(24, { each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TierListTierInputDto)
  @IsOptional()
  tiers?: TierListTierInputDto[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  bannedMoves?: string[];
}

export class ForkTierListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;
}

export class RevertTierListDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export class CompareTierListDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  with?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  rev?: number;
}

export class RevisionPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  before?: number;
}

export class CreateTierListInviteDto {
  @IsIn(TIER_LIST_ROLES)
  role!: TierListRole;

  @IsInt()
  @Min(1)
  @Max(25)
  @IsOptional()
  maxUses?: number;
}

export class AcceptTierListInviteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class SetTierListRoleDto {
  @IsIn(TIER_LIST_ROLES)
  role!: TierListRole;
}

export class SetFeaturedDto {
  @IsBoolean()
  featured!: boolean;
}
