import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsMongoId,
  Min,
  ValidateNested,
  IsUrl,
  ArrayMaxSize,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { Types } from "mongoose";

class UpdateMediaDto {
  @IsString()
  @IsOptional()
  previewVideo?: string;

  @IsString()
  @IsOptional()
  mainVideo?: string;

  @IsString()
  @IsOptional()
  thumbnailId?: string;

  @IsString()
  @IsOptional()
  projectFile?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];
}

class UpdateLiteratureDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link?: string;
}

export class UpdateProjectDto {
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

  @IsMongoId()
  @IsOptional()
  subcategory?: Types.ObjectId;

  @IsString()
  @IsOptional()
  contentLanguage?: string;

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
  @ArrayMaxSize(20, { message: "Literature must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => UpdateLiteratureDto)
  literature?: UpdateLiteratureDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: "Images must not exceed 20 items" })
  @IsString({ each: true })
  images?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedDurationMinutes?: number;

  @IsString()
  @IsOptional()
  slug?: string;
}
