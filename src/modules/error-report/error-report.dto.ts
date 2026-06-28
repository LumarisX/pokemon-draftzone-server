import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ErrorReportDto {
  @IsOptional()
  @IsInt()
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}
