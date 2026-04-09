import { Controller, UseGuards } from "@nestjs/common";
import { AdminGuard } from "src/common/guards/admin.guard";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { ProjectsService } from "./projects.service";

@UseGuards(InternalAuthGuard, AdminGuard)
@Controller("admin/projects")
export class ProjectsAdminController {
  constructor(private readonly projectsService: ProjectsService) {}

  // @Get()
  // @HttpCode(HttpStatus.OK)
  // async getAllProjects(
  //   @Query("page") page = 1,
  //   @Query("limit") limit = 20,
  //   @Query("sortBy") sortBy = "createdAt",
  //   @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
  //   @Query("status") status?: PROJECT_STATUS,
  //   @Query("visibility") visibility?: VISIBILITY_TYPE,
  //   @Query("search") search?: string,
  // ) {
  //   return await this.projectsService.findAdminProjects({
  //     page: Number(page),
  //     limit: Number(limit),
  //     sortBy,
  //     sortOrder,
  //     status,
  //     visibility,
  //     search,
  //   });
  // }

  // @Get("reports")
  // @HttpCode(HttpStatus.OK)
  // async getAllProjectReports(
  //   @Query("page") page = 1,
  //   @Query("limit") limit = 20,
  //   @Query("sortBy") sortBy = "createdAt",
  //   @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
  //   @Query("status") status?: ProjectReportStatus,
  //   @Query("reason") reason?: ProjectReportReason,
  // ) {
  //   return await this.projectsService.findAdminProjectReports({
  //     page: Number(page),
  //     limit: Number(limit),
  //     sortBy,
  //     sortOrder,
  //     status,
  //     reason,
  //   });
  // }

  // @Get("link-reports")
  // @HttpCode(HttpStatus.OK)
  // async getAllProjectLinkReports(
  //   @Query("page") page = 1,
  //   @Query("limit") limit = 20,
  //   @Query("sortBy") sortBy = "createdAt",
  //   @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",
  //   @Query("status") status?: ProjectLinkReportStatus,
  //   @Query("reason") reason?: ProjectLinkReportReason,
  // ) {
  //   return await this.projectsService.findAdminProjectLinkReports({
  //     page: Number(page),
  //     limit: Number(limit),
  //     sortBy,
  //     sortOrder,
  //     status,
  //     reason,
  //   });
  // }

  // @Patch(":id/status")
  // async updateProjectStatus(
  //   @Param("id") projectId: string,
  //   @Body() body: { status: PROJECT_STATUS },
  // ) {
  //   const project = await this.projectsService.updateProjectStatus(
  //     projectId,
  //     body.status,
  //   );
  //   return {
  //     success: true,
  //     data: project,
  //   };
  // }

  // @Patch("reports/:id/action")
  // async takeProjectReportAction(
  //   @Param("id") reportId: string,
  //   @Body() body: { status: ProjectReportStatus },
  // ) {
  //   const report = await this.projectsService.takeProjectReportAction(
  //     reportId,
  //     body.status,
  //   );
  //   return {
  //     success: true,
  //     data: report,
  //   };
  // }

  // @Patch(":id/disable-link")
  // async disableLink(
  //   @Param("id") projectId: string,
  //   @Body() body: { linkItemId: string; linkType: ProjectLinkType },
  // ) {
  //   await this.projectsService.disableLink(
  //     projectId,
  //     body.linkItemId,
  //     body.linkType,
  //   );
  //   return {
  //     success: true,
  //   };
  // }

  // @Patch("link-reports/:id/action")
  // async takeProjectLinkReportAction(
  //   @Param("id") reportId: string,
  //   @Body() body: { status: ProjectLinkReportStatus },
  // ) {
  //   const report = await this.projectsService.takeProjectLinkReportAction(
  //     reportId,
  //     body.status,
  //   );
  //   return {
  //     success: true,
  //     data: report,
  //   };
  // }
}
