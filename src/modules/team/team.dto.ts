import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  tournamentId!: string;

  @IsString()
  @MinLength(1)
  coachId!: string;

  @IsString()
  @MinLength(1)
  teamName!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  logo?: string;
}

export class UpdateTeamDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  teamName?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  logo?: string;
}
