import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { VIDEO_PURPOSE } from "../types/types";

export class CreateTempVideoDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  providerUid: string;

  @IsEnum(Object.values(VIDEO_PURPOSE))
  @IsNotEmpty()
  purpose: VIDEO_PURPOSE;

  @IsMongoId()
  @IsOptional()
  guideId?: string;
}
