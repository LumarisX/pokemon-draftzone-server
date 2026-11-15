import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class QuickMatchupSideDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  teamName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PokemonDto)
  team!: PokemonDto[];
}

export class QuickMatchupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  format!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ruleset!: string;

  @ValidateNested()
  @Type(() => QuickMatchupSideDto)
  @IsNotEmpty()
  side1!: QuickMatchupSideDto;

  @ValidateNested()
  @Type(() => QuickMatchupSideDto)
  @IsNotEmpty()
  side2!: QuickMatchupSideDto;
}
