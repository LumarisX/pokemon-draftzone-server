import {
  IsString,
  IsArray,
  IsOptional,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DraftPokemonDto } from "@modules/draft-pokemon/draft-pokemon.dto";

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftPokemonDto)
  team!: DraftPokemonDto[];
}
