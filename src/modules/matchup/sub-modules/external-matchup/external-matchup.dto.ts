import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  IsIn,
} from "class-validator";
import { ExternalMatchDto } from "./external-matchup-match/external-matchup-match.dto";
import {
  FORFEIT_SIDES,
  ForfeitSide,
  MATCH_WINNERS,
  MatchWinner,
  POKEMON_STATUSES,
  PokemonResultStatus,
} from "./external-matchup-match/external-matchup-match.schema";

export type MatchStatData = [
  string,
  {
    indirect?: number;
    kills?: number;
    teammate?: number;
    deaths?: number;
    brought?: number;
    status?: PokemonResultStatus;
  },
];

export function IsMatchStatTuple(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "isMatchStatTuple",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) return false;
          return value.every(
            (item) =>
              Array.isArray(item) &&
              item.length === 2 &&
              typeof item[0] === "string" &&
              typeof item[1] === "object" &&
              item[1] !== null &&
              (item[1].status === undefined ||
                POKEMON_STATUSES.includes(item[1].status)),
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an array of [string, MatchStatProperties] tuples.`;
        },
      },
    });
  };
}

export class MatchStatPropertiesDto {
  @IsNumber()
  @IsOptional()
  indirect?: number;

  @IsNumber()
  @IsOptional()
  kills?: number;

  @IsNumber()
  @IsOptional()
  teammate?: number;

  @IsNumber()
  @IsOptional()
  deaths?: number;

  @IsNumber()
  @IsOptional()
  brought?: number;

  @IsIn(POKEMON_STATUSES)
  @IsOptional()
  status?: PokemonResultStatus;
}

export class ExternalMatchupDto {
  @IsString()
  @MinLength(1)
  stage!: string;

  @IsString()
  @MinLength(1)
  teamName!: string;

  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsString()
  @MinLength(1)
  @IsOptional()
  coach?: string;

  @Transform(({ value }) => (value === "" || value === null ? undefined : value))
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @Transform(({ value }) => (value === "" || value === null ? undefined : value))
  @IsString()
  @IsOptional()
  opponentTimezone?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExternalMatchDto)
  matches!: ExternalMatchDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PokemonDto)
  team!: PokemonDto[];
}

export class MatchSchedulePatchDto {
  @Transform(({ value }) => (value === "" ? null : value))
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  scheduledDate!: string | null;

  @Transform(({ value }) => (value === "" || value === null ? undefined : value))
  @IsString()
  @IsOptional()
  opponentTimezone?: string;
}

export class ScorePatchDto {
  @IsString()
  @IsOptional()
  aTeamPaste?: string;

  @IsString()
  @IsOptional()
  bTeamPaste?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalMatchDto)
  matches!: ExternalMatchDto[];

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @IsOptional()
  scoreOverride?: [number, number] | null;

  @IsIn(MATCH_WINNERS)
  @IsOptional()
  winnerOverride?: MatchWinner | null;

  @IsIn(FORFEIT_SIDES)
  @IsOptional()
  forfeitedBy?: ForfeitSide | null;
}

export const NOTES_MAX_LENGTH = 20000;

export class MatchupNotesDto {
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  @IsOptional()
  notes?: string;
}
