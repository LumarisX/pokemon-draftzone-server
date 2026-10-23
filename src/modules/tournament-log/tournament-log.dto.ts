import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class LogQueryDto {
  @IsString()
  @IsOptional()
  types?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  before?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
