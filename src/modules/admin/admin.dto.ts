import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export const ADMIN_NOTE_MAX_LENGTH = 300;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class AccountNoteDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  profileId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(ADMIN_NOTE_MAX_LENGTH)
  note!: string;
}

export class TransferAccountDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  newAccountProfileId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  existingAccountProfileId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(ADMIN_NOTE_MAX_LENGTH)
  note!: string;
}

export class ResetDisplayNameDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  profileId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(ADMIN_NOTE_MAX_LENGTH)
  note!: string;
}
