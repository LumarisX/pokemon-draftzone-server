import {
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
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
  @MaxLength(32)
  from!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  to!: string;
}

export class ExternalTournamentAdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  leagueName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({}, { message: "League document must be a valid URL" })
  @MaxLength(500)
  leagueDoc?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({}, { message: "Server link must be a valid URL" })
  @MaxLength(500)
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
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  platforms!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  formats!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  rulesets!: string[];

  @IsUrl({}, { message: "Signup link must be a valid URL" })
  @MaxLength(500)
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
