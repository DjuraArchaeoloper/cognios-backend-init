import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "src/common/guards/admin.guard";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import {
  GUIDE_STATUS,
  GuideLinkReportReason,
  GuideLinkReportStatus,
  GuideLinkType,
  GuideReportReason,
  GuideReportStatus,
  VISIBILITY_TYPE,
} from "./types/guides";
import { GuidesService } from "./guides.service";

@UseGuards(InternalAuthGuard, AdminGuard)
@Controller("admin/guides")
export class GuidesAdminController {
  constructor(private readonly guidesService: GuidesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllGuides(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
    @Query("sortBy") sortBy = "createdAt",
    @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
    @Query("status") status?: GUIDE_STATUS,
    @Query("visibility") visibility?: VISIBILITY_TYPE,
    @Query("search") search?: string,
  ) {
    return await this.guidesService.findAdminGuides({
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
      status,
      visibility,
      search,
    });
  }

  @Get("reports")
  @HttpCode(HttpStatus.OK)
  async getAllGuideReports(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
    @Query("sortBy") sortBy = "createdAt",
    @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
    @Query("status") status?: GuideReportStatus,
    @Query("reason") reason?: GuideReportReason,
  ) {
    return await this.guidesService.findAdminGuideReports({
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
      status,
      reason,
    });
  }

  @Get("link-reports")
  @HttpCode(HttpStatus.OK)
  async getAllGuideLinkReports(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
    @Query("sortBy") sortBy = "createdAt",
    @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
    @Query("status") status?: GuideLinkReportStatus,
    @Query("reason") reason?: GuideLinkReportReason,
  ) {
    return await this.guidesService.findAdminGuideLinkReports({
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
      status,
      reason,
    });
  }

  @Patch(":id/status")
  async updateGuideStatus(
    @Param("id") guideId: string,
    @Body() body: { status: GUIDE_STATUS },
  ) {
    const guide = await this.guidesService.updateGuideStatus(
      guideId,
      body.status,
    );
    return {
      success: true,
      data: guide,
    };
  }

  @Patch("reports/:id/action")
  async takeGuideReportAction(
    @Param("id") reportId: string,
    @Body() body: { status: GuideReportStatus },
  ) {
    const report = await this.guidesService.takeGuideReportAction(
      reportId,
      body.status,
    );
    return {
      success: true,
      data: report,
    };
  }

  @Patch(":id/disable-link")
  async disableLink(
    @Param("id") guideId: string,
    @Body() body: { linkItemId: string; linkType: GuideLinkType },
  ) {
    await this.guidesService.disableLink(
      guideId,
      body.linkItemId,
      body.linkType,
    );
    return {
      success: true,
    };
  }

  @Patch("link-reports/:id/action")
  async takeGuideLinkReportAction(
    @Param("id") reportId: string,
    @Body() body: { status: GuideLinkReportStatus },
  ) {
    const report = await this.guidesService.takeGuideLinkReportAction(
      reportId,
      body.status,
    );
    return {
      success: true,
      data: report,
    };
  }
}
