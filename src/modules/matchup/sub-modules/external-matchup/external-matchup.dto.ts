import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { Transform, Type } from "class-transformer";
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
import { ExternalMatchDto } from "./external-matchup-match/external-matchup-match.dto";

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
