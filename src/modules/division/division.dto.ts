import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

export class DraftPickDto {
  @IsString()
  @MinLength(1)
  pokemonId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addons?: string[];
}

export class SetPicksDto {
  @IsArray()
  picks!: DraftPickDto[][];
}

export class SetDivisionStateDto {
  @IsString()
  @MinLength(1)
  state!: string;
}

export class MatchupScoreDto {
  @IsNumber()
  team1!: number;

  @IsNumber()
  team2!: number;
}

export class MatchTeamResultDto {
  @IsNumber()
  score!: number;

  @IsObject()
  pokemon!: Record<
    string,
    {
      kills?: { direct?: number; indirect?: number; teammate?: number };
      status: "brought" | "survived" | "fainted" | null;
    }
  >;
}

export class MatchResultDto {
  @IsString()
  @IsOptional()
  link?: string;

  @IsIn(["side1", "side2", "draw"])
  winner!: "side1" | "side2" | "draw";

  @ValidateNested()
  @Type(() => MatchTeamResultDto)
  team1!: MatchTeamResultDto;

  @ValidateNested()
  @Type(() => MatchTeamResultDto)
  team2!: MatchTeamResultDto;
}

export class UpdateMatchupDto {
  @ValidateNested()
  @Type(() => MatchupScoreDto)
  @IsOptional()
  score?: MatchupScoreDto;

  @IsIn(["side1", "side2", "draw", "side1ffw", "side2ffw", "dffl"])
  @IsOptional()
  winner?: "side1" | "side2" | "draw" | "side1ffw" | "side2ffw" | "dffl";

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchResultDto)
  matches!: MatchResultDto[];
}

export class TradePokemonDto {
  @IsString()
  id!: string;

  @IsBoolean()
  tera!: boolean;
}

export class TradeSideDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  team?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradePokemonDto)
  pokemon!: TradePokemonDto[];
}

export class MakeTradeDto {
  @ValidateNested()
  @Type(() => TradeSideDto)
  side1!: TradeSideDto;

  @ValidateNested()
  @Type(() => TradeSideDto)
  side2!: TradeSideDto;

  @IsNumber()
  stage!: number;
}
