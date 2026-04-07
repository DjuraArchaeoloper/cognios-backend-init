import { IsString, IsNotEmpty, IsEnum, IsUrl } from "class-validator";
import { ProjectLinkReportReason, ProjectLinkType } from "../types/projects";

export class ReportLinkDto {
  @IsString()
  @IsNotEmpty()
  linkItemId: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link: string;

  @IsEnum(ProjectLinkType)
  @IsNotEmpty()
  linkType: ProjectLinkType;

  @IsEnum(ProjectLinkReportReason)
  @IsNotEmpty()
  reason: ProjectLinkReportReason;
}
