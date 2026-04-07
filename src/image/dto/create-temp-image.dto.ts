import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { IMAGE_PURPOSE } from "../types/types";

export class CreateTempImageDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  providerUid: string;

  @IsEnum(Object.values(IMAGE_PURPOSE))
  @IsNotEmpty()
  purpose: IMAGE_PURPOSE;

  @IsMongoId()
  @IsOptional()
  guideId?: string;
}
