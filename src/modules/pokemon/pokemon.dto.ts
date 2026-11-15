import {
  ArrayMaxSize,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PokemonModifiers {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  abilities?: string[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  moves?: string[];
}

export class DraftFormeDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  name?: string;
}

export class PokemonCapt {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  tera?: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  z?: string[];

  @IsBoolean()
  @IsOptional()
  dmax?: boolean;
}

export class PokemonDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsBoolean()
  @IsOptional()
  shiny?: boolean;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  nickname?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DraftFormeDto)
  @IsOptional()
  draftFormes?: DraftFormeDto[];

  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(["M", "F"], { each: true })
  @IsOptional()
  genders?: ("M" | "F")[];

  @ValidateNested()
  @Type(() => PokemonModifiers)
  @IsOptional()
  modifiers?: PokemonModifiers;

  @ValidateNested()
  @Type(() => PokemonCapt)
  @IsOptional()
  capt?: PokemonCapt;
}
