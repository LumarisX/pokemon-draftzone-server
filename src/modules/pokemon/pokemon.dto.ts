import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PokemonModifiers {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  abilities?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  moves?: string[];
}

export class PokemonCapt {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tera?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  z?: string[];

  @IsBoolean()
  @IsOptional()
  dmax?: boolean;
}

export class PokemonDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsBoolean()
  @IsOptional()
  shiny?: boolean;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsArray()
  @IsOptional()
  draftFormes?: string[];

  @IsArray()
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
