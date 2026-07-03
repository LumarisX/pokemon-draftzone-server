import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class DraftPickDto {
  @IsString()
  @MinLength(1)
  pokemonId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addons?: string[];
}

export class DraftDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DraftPickDto)
  add?: DraftPickDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  remove?: string[];

  @IsArray()
  @IsOptional()
  picks?: DraftPickDto[][];
}

export class SetPicksDto {
  @IsArray()
  picks!: DraftPickDto[][];
}

export class SetDraftStateDto {
  @IsString()
  @MinLength(1)
  state!: string;
}
