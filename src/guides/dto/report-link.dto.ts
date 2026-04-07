import { IsString, IsNotEmpty, IsEnum, IsUrl } from "class-validator";
import { GuideLinkReportReason, GuideLinkType } from "../types/guides";

export class ReportLinkDto {
  @IsString()
  @IsNotEmpty()
  linkItemId: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: "Link must be a valid URL" })
  link: string;

  @IsEnum(GuideLinkType)
  @IsNotEmpty()
  linkType: GuideLinkType;

  @IsEnum(GuideLinkReportReason)
  @IsNotEmpty()
  reason: GuideLinkReportReason;
}
