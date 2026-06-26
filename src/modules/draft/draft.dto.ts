import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class DraftPickDto {
  @IsString()
  @MinLength(1)
  pokemonId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addons?: string[];
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
