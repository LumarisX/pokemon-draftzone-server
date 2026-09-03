import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { TEAM_CONTEXT_TYPES, TeamContextType } from "./teambuilder-team.schema";

export class SetStatsDto {
  @IsInt() @Min(0) @Max(255) hp!: number;
  @IsInt() @Min(0) @Max(255) atk!: number;
  @IsInt() @Min(0) @Max(255) def!: number;
  @IsInt() @Min(0) @Max(255) spa!: number;
  @IsInt() @Min(0) @Max(255) spd!: number;
  @IsInt() @Min(0) @Max(255) spe!: number;
}

export class PokemonSetDto {
  @IsString() @MaxLength(64) id!: string;

  @IsOptional() @IsString() @MaxLength(32) nickname?: string;

  @IsInt() @Min(1) @Max(100) level!: number;

  @IsIn(["", "M", "F"]) gender!: "" | "M" | "F";

  @IsBoolean() shiny!: boolean;

  @IsOptional() @IsString() @MaxLength(64) ability?: string;

  @IsOptional() @IsString() @MaxLength(64) item?: string;

  @IsOptional() @IsString() @MaxLength(32) nature?: string;

  @IsOptional() @IsString() @MaxLength(32) teraType?: string;

  @IsArray() moves!: (string | null)[];

  @ValidateNested() @Type(() => SetStatsDto) ivs!: SetStatsDto;

  @ValidateNested() @Type(() => SetStatsDto) evs!: SetStatsDto;

  @ValidateNested() @Type(() => SetStatsDto) sps!: SetStatsDto;

  @IsInt() @Min(0) @Max(255) happiness!: number;

  @IsInt() @Min(0) @Max(10) dynamaxLevel!: number;

  @IsBoolean() gigantamax!: boolean;

  @IsOptional() @IsString() @MaxLength(32) hpType?: string;

  @IsOptional() @IsString() @MaxLength(32) pokeball?: string;
}

export class TeamContextDto {
  @IsIn(TEAM_CONTEXT_TYPES as unknown as string[])
  type!: TeamContextType;

  @IsOptional() @IsString() @MaxLength(128) id?: string;
}

export class SaveTeamDto {
  @ValidateNested() @Type(() => TeamContextDto) context!: TeamContextDto;

  @IsOptional() @IsString() @MaxLength(64) name?: string;

  @IsString() @MaxLength(64) ruleset!: string;

  @IsInt() @Min(1) @Max(100) level!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PokemonSetDto)
  sets!: PokemonSetDto[];
}
