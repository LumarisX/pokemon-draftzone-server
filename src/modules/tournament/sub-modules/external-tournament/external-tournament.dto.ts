import {
  IsString,
  IsArray,
  IsOptional,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";

export class ExternalTournamentDto {
  @IsString()
  @MinLength(1)
  leagueName!: string;

  @IsString()
  @MinLength(1)
  teamName!: string;

  @IsString()
  @MinLength(1)
  format!: string;

  @IsString()
  @MinLength(1)
  ruleset!: string;

  @IsString()
  @IsOptional()
  doc?: string;

  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsString()
  @MinLength(1)
  @IsOptional()
  coach?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PokemonDto)
  team!: PokemonDto[];
}
