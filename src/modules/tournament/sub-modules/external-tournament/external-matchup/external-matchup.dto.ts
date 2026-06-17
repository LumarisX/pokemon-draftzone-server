import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  IsIn,
} from "class-validator";

export type MatchStatData = [
  string,
  {
    indirect?: number;
    kills?: number;
    deaths?: number;
    brought?: number;
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
              item[1] !== null,
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
  deaths?: number;

  @IsNumber()
  @IsOptional()
  brought?: number;
}

export class TeamStatDataDto {
  @IsMatchStatTuple()
  stats!: MatchStatData[];

  @IsNumber()
  score!: number;
}

export class MatchDto {
  @ValidateNested()
  @Type(() => TeamStatDataDto)
  aTeam!: TeamStatDataDto;

  @ValidateNested()
  @IsOptional()
  @Type(() => TeamStatDataDto)
  bTeam?: TeamStatDataDto;

  @IsString()
  @MinLength(1)
  @IsOptional()
  replay?: string;

  @IsIn(["a", "b"])
  @IsOptional()
  winner?: "a" | "b";
}

export class ExternalMatchupDto {
  @IsString()
  @MinLength(1)
  stage!: string;

  @IsString()
  @MinLength(1)
  teamName!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  coach?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MatchDto)
  matches!: MatchDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PokemonDto)
  team!: PokemonDto[];
}

class ScorePokemonIdDto {
  @IsString()
  id!: string;
}

class ScorePokemonDto {
  @ValidateNested()
  @Type(() => ScorePokemonIdDto)
  pokemon!: ScorePokemonIdDto;

  @IsNumber()
  kills!: number;

  @IsNumber()
  fainted!: number;

  @IsNumber()
  indirect!: number;

  @IsNumber()
  brought!: number;
}

class ScoreTeamDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScorePokemonDto)
  team!: ScorePokemonDto[];
}

class ScoreMatchDto {
  @IsString()
  @IsOptional()
  replay?: string | null;

  @IsIn(["a", "b", ""])
  @IsOptional()
  winner?: "a" | "b" | "";

  @ValidateNested()
  @Type(() => ScoreTeamDto)
  aTeam!: ScoreTeamDto;

  @ValidateNested()
  @Type(() => ScoreTeamDto)
  bTeam!: ScoreTeamDto;
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
  @Type(() => ScoreMatchDto)
  matches!: ScoreMatchDto[];
}

export class SchedulePatchDto {
  @IsString()
  @MinLength(1)
  dateTime!: string;

  @IsOptional()
  email?: boolean;

  @IsNumber()
  @IsOptional()
  emailTime?: number;
}
