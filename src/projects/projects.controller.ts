import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Get,
  Param,
  Delete,
  Patch,
  Query,
} from "@nestjs/common";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { getUserId, getUserRole } from "src/common/helpers/auth";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { DIFFICULTY } from "./types/projects";
import { OptionalAuthGuard } from "src/common/guards/optional-auth.guard";

@Controller("projects")
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
    @Request() req,
  ) {
    const userId = getUserId(req);
    const project = await this.projectsService.createProject(
      userId,
      createProjectDto,
    );
    return {
      success: true,
      message: "Project created successfully",
      data: project,
    };
  }

  @Get("edit/:slug")
  @UseGuards(InternalAuthGuard)
  async getProjectForEditing(@Param("slug") slug: string, @Request() req) {
    const userId = getUserId(req);
    const userRole = getUserRole(req);

    const user = userId ? { id: userId, role: userRole } : null;

    const project = await this.projectsService.getProjectForEditing(slug, user);
    return {
      success: true,
      data: project,
    };
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async publishProject(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.projectsService.publishProject(id, userId);
    return {
      success: result.success,
      message: result.success ? "Project published successfully" : result.error,
      data: { status: result.status },
    };
  }

  @Post(":id/unpublish")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async unpublishProject(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.projectsService.unpublishProject(id, userId);
    return {
      success: result.success,
      message: result.success
        ? "Project unpublished successfully"
        : result.error,
      data: { status: result.status },
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteProject(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.projectsService.deleteProject(id, userId);
    return {
      success: result.success,
      message: result.success ? "Project deleted successfully" : result.error,
    };
  }

  @Post("creator/:creatorId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getProjectsByCreator(
    @Param("creatorId") creatorId: string,
    @Request() req,
  ) {
    const userId = getUserId(req);
    const projects = await this.projectsService.getProjectsByCreator(
      creatorId,
      userId,
    );
    return {
      success: true,
      data: projects,
    };
  }

  @Get(":slug")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalAuthGuard)
  async getProjectBySlug(@Param("slug") slug: string, @Request() req) {
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    const walletAddress = req.authUser?.walletAddress;

    const user = userId
      ? {
          id: userId,
          role: userRole || undefined,
          walletAddress: walletAddress || undefined,
        }
      : null;

    const project = await this.projectsService.getProjectBySlug(slug, user);
    return {
      success: true,
      data: project,
    };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async updateProject(
    @Param("id") id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @Request() req,
  ) {
    const userId = getUserId(req);
    const project = await this.projectsService.updateProject(
      id,
      userId,
      updateProjectDto,
    );
    return {
      success: true,
      message: "Project updated successfully",
      data: project,
    };
  }

  @Post(":projectId/pdf/access")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async accessPdf(@Param("projectId") projectId: string, @Request() req) {
    const userId = getUserId(req);
    const projectPdfAccess = await this.projectsService.accessProjectPdf(
      userId,
      projectId,
    );
    return {
      success: true,
      data: projectPdfAccess,
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getPublicProjects(
    @Query("page") page = 1,
    @Query("limit") limit = 12,
    @Query("sortBy") sortBy = "createdAt",
    @Query("sortOrder") sortOrder: "asc" | "desc" = "desc",

    @Query("category") categoryId?: string,
    @Query("subcategory") subcategoryId?: string,

    @Query("search") search?: string,
    @Query("difficulty") difficulty?: DIFFICULTY,
    @Query("price") price?: string,
    @Query("duration") duration?: string,
  ) {
    return await this.projectsService.findPublicExploreProjects({
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
      categoryId,
      subcategoryId,
      search,
      difficulty,
      price,
      duration,
    });
  }

  // @Post(":id/report")
  // @HttpCode(HttpStatus.OK)
  // async reportProject(
  //   @Param("id") id: string,
  //   @Body() reportProjectDto: ReportProjectDto,
  //   @Request() req,
  // ) {
  //   const userId = getUserId(req);

  //   const success = await this.projectsService.reportProject(
  //     id,
  //     reportProjectDto,
  //     userId,
  //   );
  //   return {
  //     success,
  //   };
  // }

  // @Post(":id/report-link")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(InternalAuthGuard)
  // async reportLink(
  //   @Param("id") id: string,
  //   @Body() reportLinkDto: ReportLinkDto,
  //   @Request() req,
  // ) {
  //   const userId = getUserId(req);

  //   await this.projectsService.reportLink(id, reportLinkDto, userId);
  //   return {
  //     success: true,
  //     message: "Link report submitted successfully",
  //   };
  // }

  // ///
  // /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  // ///

  // @UseGuards(ServiceToServiceGuard)
  // @Get(":projectId/internal")
  // async getProjectForPurchase(@Param("projectId") projectId: string) {
  //   const project = await this.projectsService.getProjectForPurchase(projectId);
  //   return {
  //     success: true,
  //     data: project,
  //   };
  // }

  // @Post(":id/purchase/internal")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(ServiceToServiceGuard)
  // async incrementPurchaseCount(@Param("id") id: string) {
  //   await this.projectsService.incrementPurchaseCount(id);
  //   return {
  //     success: true,
  //     message: "Purchase count incremented",
  //   };
  // }

  // @Get("creator/:creatorId/public/internal")
  // @UseGuards(ServiceToServiceGuard)
  // async getPublicProjectsByCreator(@Param("creatorId") creatorId: string) {
  //   const projects = await this.projectsService.getPublicProjectsByCreator(creatorId);
  //   return {
  //     success: true,
  //     data: projects,
  //   };
  // }
}
