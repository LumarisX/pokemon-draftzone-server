import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsArray,
  IsDate,
  IsNumber,
  ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === "" || value === null ? undefined : value;

const emptyToUndefinedDate = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined
    ? undefined
    : new Date(value as string | number | Date);

export class SkillLevelRangeDto {
  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;
}

export class ExternalTournamentAdDto {
  @IsString()
  @IsNotEmpty()
  leagueName!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({}, { message: "League document must be a valid URL" })
  leagueDoc?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({}, { message: "Server link must be a valid URL" })
  serverLink?: string;

  @ValidateNested()
  @Type(() => SkillLevelRangeDto)
  @IsNotEmpty()
  skillLevelRange!: SkillLevelRangeDto;

  @Transform(({ value }) =>
    typeof value === "string" ? parseFloat(value) : value,
  )
  @IsNumber({}, { message: "Prize value must be a number" })
  prizeValue!: number;

  @IsArray()
  @IsString({ each: true })
  platforms!: string[];

  @IsArray()
  @IsString({ each: true })
  formats!: string[];

  @IsArray()
  @IsString({ each: true })
  rulesets!: string[];

  @IsUrl({}, { message: "Signup link must be a valid URL" })
  signupLink!: string;

  @Type(() => Date)
  @IsDate()
  closesAt!: Date;

  @IsOptional()
  @Transform(emptyToUndefinedDate)
  @IsDate()
  seasonStart?: Date;

  @IsOptional()
  @Transform(emptyToUndefinedDate)
  @IsDate()
  seasonEnd?: Date;
}
