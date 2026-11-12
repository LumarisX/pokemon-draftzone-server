import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export const TEAM_IDENTITY_NAME_LIMIT = 64;

export class RenameTeamIdentityDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(TEAM_IDENTITY_NAME_LIMIT)
  name!: string;
}
