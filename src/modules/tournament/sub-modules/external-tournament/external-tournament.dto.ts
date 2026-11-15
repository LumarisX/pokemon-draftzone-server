import {
  IsString,
  IsArray,
  IsOptional,
  ArrayMaxSize,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";

export class ExternalTournamentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  leagueName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  teamName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  format!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ruleset!: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  doc?: string;

  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  coach?: string;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => PokemonDto)
  team!: PokemonDto[];
}
