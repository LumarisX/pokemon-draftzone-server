import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { LAYOUT_IDS, LayoutId } from "./layouts";

export const MAX_IMPORT_TEXT = 400_000;

export class ImportPreviewDto {
  @IsString()
  @MaxLength(MAX_IMPORT_TEXT)
  @IsOptional()
  text?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  url?: string;

  @IsString()
  @MinLength(1)
  format!: string;

  @IsString()
  @MinLength(1)
  ruleset!: string;

  @IsIn(LAYOUT_IDS)
  @IsOptional()
  layout?: LayoutId;
}

export class ImportAliasEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  text!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  pokemonIds!: string[];
}

export class SaveImportAliasesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportAliasEntryDto)
  entries!: ImportAliasEntryDto[];
}
