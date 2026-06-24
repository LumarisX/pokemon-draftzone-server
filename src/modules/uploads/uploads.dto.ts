import {
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { UploadFolder } from "./upload-folder.enum";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "./uploads.constants";

export class RequestUploadUrlDto {
  @IsEnum(UploadFolder)
  folder!: UploadFolder;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[^/\\]+$/, {
    message: "fileName must not contain path separators",
  })
  fileName!: string;

  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType!: string;
}
