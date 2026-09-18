import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateLeagueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  logo?: string;
}
