import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsMongoId,
  Min,
  ValidateNested,
  IsUrl,
  ArrayMaxSize,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import {
  VISIBILITY_TYPE,
  MONETIZATION_TYPE,
  DIFFICULTY,
  VIDEO_ASSET_ROLE,
  VIDEO_ASSET_SOURCE,
  FILE_ASSET_ROLE,
  FILE_ASSET_SOURCE,
} from "../types/guides";
import { Types } from "mongoose";

class UpdateVideoAssetDto {
  @IsString()
  @IsOptional()
  streamId?: string;

  @IsEnum(VIDEO_ASSET_ROLE)
  @IsOptional()
  role?: VIDEO_ASSET_ROLE;

  @IsEnum(VIDEO_ASSET_SOURCE)
  @IsOptional()
  source?: VIDEO_ASSET_SOURCE;

  @IsString()
  @IsOptional()
  displayName?: string;
}

class UpdateFileAssetDto {
  @IsString()
  @IsOptional()
  fileKey?: string;

  @IsEnum(FILE_ASSET_ROLE)
  @IsOptional()
  role?: FILE_ASSET_ROLE;

  @IsEnum(FILE_ASSET_SOURCE)
  @IsOptional()
  source?: FILE_ASSET_SOURCE;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsNumber()
  @IsOptional()
  fileSize?: number;
}

class UpdateToolOrMaterialDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link?: string;
}

class UpdateMediaDto {
  @ValidateNested()
  @Type(() => UpdateVideoAssetDto)
  @IsOptional()
  previewVideo?: UpdateVideoAssetDto;

  @ValidateNested()
  @Type(() => UpdateVideoAssetDto)
  @IsOptional()
  mainVideo?: UpdateVideoAssetDto;

  @IsString()
  @IsOptional()
  thumbnailId?: string;

  @ValidateNested()
  @Type(() => UpdateFileAssetDto)
  @IsOptional()
  guideFile?: UpdateFileAssetDto;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateGuideDto {
  @IsEnum(DIFFICULTY)
  @IsOptional()
  difficulty?: DIFFICULTY;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  description?: string;

  @IsMongoId()
  @IsOptional()
  category?: Types.ObjectId;

  @IsArray()
  @IsOptional()
  @IsMongoId({ each: true })
  subcategories?: string[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(15, { message: "Tags must not exceed 15 items" })
  @IsString({ each: true })
  tags?: string[];

  @IsEnum(VISIBILITY_TYPE)
  @IsOptional()
  visibility?: VISIBILITY_TYPE;

  @IsString()
  @IsOptional()
  contentLanguage?: string;

  @IsEnum(MONETIZATION_TYPE)
  @IsOptional()
  monetizationType?: MONETIZATION_TYPE;

  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ValidateNested()
  @Type(() => UpdateMediaDto)
  @IsOptional()
  media?: UpdateMediaDto;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: "Tools must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => UpdateToolOrMaterialDto)
  tools?: UpdateToolOrMaterialDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: "Materials must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => UpdateToolOrMaterialDto)
  materials?: UpdateToolOrMaterialDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  safetyNotes: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedDurationMinutes?: number;

  @IsString()
  @IsOptional()
  slug?: string;
}
