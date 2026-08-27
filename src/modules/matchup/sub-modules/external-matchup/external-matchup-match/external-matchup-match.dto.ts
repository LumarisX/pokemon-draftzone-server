import { Type } from "class-transformer";
import {
  IsNumber,
  ValidateNested,
  IsOptional,
  IsString,
  MinLength,
  IsIn,
} from "class-validator";
import { IsMatchStatTuple, MatchStatData } from "../external-matchup.dto";
import { MATCH_WINNERS, MatchWinner } from "./external-matchup-match.schema";

export class TeamStatDataDto {
  @IsMatchStatTuple()
  stats!: MatchStatData[];

  @IsNumber()
  score!: number;
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
  @IsOptional()
  replay?: string;

  @IsIn(MATCH_WINNERS)
  @IsOptional()
  winner?: MatchWinner;
}
