import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ValidateIf,
} from "class-validator";
import { Type, Transform } from "class-transformer";

export class UploadFileDto {
  @IsString()
  @IsOptional()
  folder?: string;

  @Transform(({ value }) => (value ? Number(value) : undefined))
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxSize?: number;

  @Transform(({ value }) => {
    if (!value) return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @ValidateIf((o) => o.allowedTypes !== undefined)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedTypes?: string[];
}
