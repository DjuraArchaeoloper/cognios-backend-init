import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  IsMongoId,
  Min,
  ValidateNested,
  IsUrl,
  MaxLength,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";
import { Types } from "mongoose";

class CreateLiteratureDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link?: string;
}

class CreateMediaDto {
  @IsString()
  @IsNotEmpty()
  previewVideo: string;

  @IsString()
  @IsNotEmpty()
  mainVideo: string;

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

export class CreateProjectDto {
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

  @IsMongoId()
  @IsOptional()
  subcategory: Types.ObjectId;

  @IsString()
  @IsNotEmpty()
  contentLanguage: string;

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
  @ArrayMaxSize(20, { message: "Literature must not exceed 20 items" })
  @ValidateNested({ each: true })
  @Type(() => CreateLiteratureDto)
  literature: CreateLiteratureDto[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedDurationMinutes?: number;

  @IsMongoId()
  @IsNotEmpty()
  creatorId: Types.ObjectId;

  @IsString()
  @IsNotEmpty()
  creatorWallet: string;
}
