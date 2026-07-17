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

/** Wire shape for a draft forme: the client works with `{ id, name }`
 * objects, while the server stores and processes bare ids. */
export class DraftFormeDto {
  @IsString()
  id!: string;

  @IsString()
  @IsOptional()
  name?: string;
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
  @ValidateNested({ each: true })
  @Type(() => DraftFormeDto)
  @IsOptional()
  draftFormes?: DraftFormeDto[];

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
