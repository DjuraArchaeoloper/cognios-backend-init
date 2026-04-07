import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from "class-validator";
import { Type, Transform } from "class-transformer";

export class UploadImageDto {
  @IsString()
  @IsOptional()
  folder?: string;

  @Transform(({ value }) => (value ? Number(value) : undefined))
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(10000)
  maxWidth?: number;

  @Transform(({ value }) => (value ? Number(value) : undefined))
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(10000)
  maxHeight?: number;

  @Transform(({ value }) => (value ? Number(value) : undefined))
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  quality?: number;

  @IsEnum(["jpeg", "png", "webp"])
  @IsOptional()
  format?: "jpeg" | "png" | "webp";
}
