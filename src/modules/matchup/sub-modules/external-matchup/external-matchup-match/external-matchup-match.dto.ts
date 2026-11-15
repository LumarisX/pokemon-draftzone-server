import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  Max,
  Min,
  IsBoolean,
  IsNumber,
  ValidateNested,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsIn,
  registerDecorator,
  ValidationOptions,
} from "class-validator";
import { IsMatchStatTuple, MatchStatData } from "../external-matchup.dto";
import {
  KO_NOTE_MAX_LENGTH,
  MATCH_WINNERS,
  MatchWinner,
} from "./external-matchup-match.schema";

export class TeamStatDataDto {
  @IsMatchStatTuple()
  stats!: MatchStatData[];

  @IsNumber()
  @Min(0)
  @Max(99)
  score!: number;
}

export class MatchPokemonRefDto {
  @IsIn(MATCH_WINNERS)
  team!: MatchWinner;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pokemon!: string;
}

export class MatchKoDto {
  @ValidateNested()
  @Type(() => MatchPokemonRefDto)
  victim!: MatchPokemonRefDto;

  @ValidateNested()
  @IsOptional()
  @Type(() => MatchPokemonRefDto)
  attacker?: MatchPokemonRefDto;

  @IsBoolean()
  indirect!: boolean;

  @IsString()
  @MaxLength(KO_NOTE_MAX_LENGTH)
  @IsOptional()
  note?: string;
}

function HasUniqueVictims(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "hasUniqueVictims",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return true;
          const victims = value.map(
            (ko) => `${ko?.victim?.team}:${ko?.victim?.pokemon}`,
          );
          return new Set(victims).size === victims.length;
        },
        defaultMessage() {
          return "Each Pokémon can only be knocked out once per game.";
        },
      },
    });
  };
}

export class ExternalMatchDto {
  @ValidateNested()
  @Type(() => TeamStatDataDto)
  aTeam!: TeamStatDataDto;

  @ValidateNested()
  @IsOptional()
  @Type(() => TeamStatDataDto)
  bTeam?: TeamStatDataDto;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @IsOptional()
  replay?: string;

  @IsIn(MATCH_WINNERS)
  @IsOptional()
  winner?: MatchWinner;

  @IsArray()
  @ArrayMaxSize(60)
  @IsOptional()
  @ValidateNested({ each: true })
  @HasUniqueVictims()
  @Type(() => MatchKoDto)
  kos?: MatchKoDto[];
}
