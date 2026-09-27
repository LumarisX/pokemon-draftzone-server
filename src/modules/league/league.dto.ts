import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateLeagueDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
}

export class UpdateLeagueDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @ValidateIf((dto: UpdateLeagueDto) => dto.logo !== null)
  @IsOptional()
  logo?: string | null;
}
