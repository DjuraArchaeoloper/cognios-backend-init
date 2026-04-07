import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { FILE_PURPOSE } from "../types/types";

export class CreateTempFileDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  providerUid: string;

  @IsEnum(Object.values(FILE_PURPOSE))
  @IsNotEmpty()
  purpose: FILE_PURPOSE;

  @IsMongoId()
  @IsOptional()
  guideId?: string;
}
