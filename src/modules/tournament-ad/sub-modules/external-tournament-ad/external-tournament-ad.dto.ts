import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsArray,
  IsIn,
  IsDate,
  IsNumber,
  ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";

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
  @IsUrl({}, { message: "League document must be a valid URL" })
  leagueDoc?: string;

  @IsOptional()
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

  @IsOptional()
  @IsIn(["Approved", "Pending", "Denied"], { message: "Invalid status value" })
  status?: "Approved" | "Pending" | "Denied";

  @IsUrl({}, { message: "Signup link must be a valid URL" })
  signupLink!: string;

  @Type(() => Date)
  @IsDate()
  closesAt!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  seasonStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  seasonEnd?: Date;
}
