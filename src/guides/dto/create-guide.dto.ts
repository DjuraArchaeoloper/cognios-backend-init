import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsMongoId,
  Min,
  ValidateNested,
  IsUrl,
  MaxLength,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";
import {
  GUIDE_TYPE,
  MONETIZATION_TYPE,
  VISIBILITY_TYPE,
  DIFFICULTY,
  VIDEO_ASSET_ROLE,
  VIDEO_ASSET_SOURCE,
  FILE_ASSET_ROLE,
  FILE_ASSET_SOURCE,
} from "../types/guides";
import { Types } from "mongoose";

class CreateVideoAssetDto {
  @IsString()
  @IsNotEmpty()
  streamId: string;

  @IsEnum(VIDEO_ASSET_ROLE)
  @IsNotEmpty()
  role: VIDEO_ASSET_ROLE;

  @IsEnum(VIDEO_ASSET_SOURCE)
  @IsNotEmpty()
  source: VIDEO_ASSET_SOURCE;

  @IsString()
  @IsNotEmpty()
  displayName: string;
}

class CreateFileAssetDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsEnum(FILE_ASSET_ROLE)
  @IsNotEmpty()
  role: FILE_ASSET_ROLE;

  @IsEnum(FILE_ASSET_SOURCE)
  @IsNotEmpty()
  source: FILE_ASSET_SOURCE;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @IsNotEmpty()
  fileSize: number;
}

class CreateToolOrMaterialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link?: string;
}

class CreateMainCreatorSnapshotDto {
  @IsMongoId()
  @IsNotEmpty()
  _id: Types.ObjectId;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

class CreateMediaDto {
  @ValidateNested()
  @Type(() => CreateVideoAssetDto)
  @IsNotEmpty()
  previewVideo: CreateVideoAssetDto;

  @ValidateNested()
  @Type(() => CreateVideoAssetDto)
  @IsNotEmpty()
  mainVideo: CreateVideoAssetDto;

  @IsString()
  @IsOptional()
  thumbnailId?: string;

  @ValidateNested()
  @Type(() => CreateFileAssetDto)
  @IsOptional()
  guideFile?: CreateFileAssetDto;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];
}

export class CreateGuideDto {
  @IsEnum(GUIDE_TYPE)
  @IsNotEmpty()
  guideType: GUIDE_TYPE;

  @IsEnum(DIFFICULTY)
  @IsNotEmpty()
  difficulty: DIFFICULTY;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description: string;

  @IsMongoId()
  @IsNotEmpty()
  category: Types.ObjectId;

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
  @IsNotEmpty()
  visibility: VISIBILITY_TYPE;

  @IsString()
  @IsNotEmpty()
  contentLanguage: string;

  @IsEnum(MONETIZATION_TYPE)
  @IsNotEmpty()
  monetizationType: MONETIZATION_TYPE;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  price: number;

  @ValidateNested()
  @Type(() => CreateMediaDto)
  @IsNotEmpty()
  media: CreateMediaDto;

  @IsArray()
  @IsNotEmpty()
  @ArrayMaxSize(20, { message: "Tools must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => CreateToolOrMaterialDto)
  tools: CreateToolOrMaterialDto[];

  @IsArray()
  @IsNotEmpty()
  @ArrayMaxSize(20, { message: "Materials must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => CreateToolOrMaterialDto)
  materials: CreateToolOrMaterialDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  safetyNotes: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedDurationMinutes?: number;

  @IsMongoId()
  @IsNotEmpty()
  mainCreator: Types.ObjectId;

  @ValidateNested()
  @Type(() => CreateMainCreatorSnapshotDto)
  @IsNotEmpty()
  mainCreatorSnapshot: CreateMainCreatorSnapshotDto;
}
