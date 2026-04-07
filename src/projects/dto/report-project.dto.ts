import { IsString, IsNotEmpty, IsEnum, IsOptional } from "class-validator";
import { ProjectReportReason } from "../types/projects";

export class ReportProjectDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(ProjectReportReason)
  reason: ProjectReportReason;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  userId?: string | null;
}
