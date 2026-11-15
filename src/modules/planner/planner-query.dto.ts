import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class PlannerQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ruleset!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  team!: string;
}
