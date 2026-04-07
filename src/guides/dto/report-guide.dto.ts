import { IsString, IsNotEmpty, IsEnum, IsOptional } from "class-validator";
import { GuideReportReason } from "../types/guides";

export class ReportGuideDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(GuideReportReason)
  reason: GuideReportReason;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  userId?: string | null;
}
