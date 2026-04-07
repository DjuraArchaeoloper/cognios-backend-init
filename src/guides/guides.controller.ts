import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from "@nestjs/common";
import { GuidesService } from "./guides.service";
import { CreateGuideDto } from "./dto/create-guide.dto";
import { UpdateGuideDto } from "./dto/update-guide.dto";
import { ReportLinkDto } from "./dto/report-link.dto";
import { ReportGuideDto } from "./dto/report-guide.dto";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import {
  getOptionalUserId,
  getOptionalUserRole,
  getUserId,
  getUserRole,
} from "src/common/helpers/auth";
import { DIFFICULTY } from "./types/guides";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("guides")
export class GuidesController {
  constructor(private guidesService: GuidesService) {}

  @Get("public/:slug")
  async getGuideMetadataBySlug(@Param("slug") slug: string) {
    const guide = await this.guidesService.getGuideMetadataBySlug(slug);
    return {
      success: true,
      data: guide,
    };
  }

  @Get("sitemap")
  async getPublicGuidesForSitemap() {
    const guides = await this.guidesService.getPublicGuidesForSitemap();
    return {
      success: true,
      data: guides,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InternalAuthGuard)
  async createGuide(@Body() createGuideDto: CreateGuideDto, @Request() req) {
    const userId = getUserId(req);
    const guide = await this.guidesService.createGuide(userId, createGuideDto);
    return {
      success: true,
      message: "Guide created successfully",
      data: guide,
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getPublicGuides(
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
    return this.guidesService.findPublicExploreGuides({
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

  @Get(":slug")
  @HttpCode(HttpStatus.OK)
  async getGuideBySlug(@Param("slug") slug: string, @Request() req) {
    const userId = getOptionalUserId(req);
    const userRole = getOptionalUserRole(req) as string | undefined;

    const user = userId ? { id: userId, role: userRole || undefined } : null;

    const guide = await this.guidesService.getGuideBySlug(slug, user);
    return {
      success: true,
      data: guide,
    };
  }

  @Post(":guideId/pdf/access")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async accessPdf(@Param("guideId") guideId: string, @Request() req) {
    const userId = getUserId(req);
    const guidePdfAccess = await this.guidesService.accessGuidePdf(
      userId,
      guideId,
    );
    return {
      success: true,
      data: guidePdfAccess,
    };
  }

  @Get("edit/:slug")
  async getGuideForEditing(@Param("slug") slug: string, @Request() req) {
    const userId = getUserId(req);
    const userRole = getUserRole(req);

    const user = userId ? { id: userId, role: userRole } : null;

    const guide = await this.guidesService.getGuideForEditing(slug, user);
    return {
      success: true,
      data: guide,
    };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async updateGuide(
    @Param("id") id: string,
    @Body() updateGuideDto: UpdateGuideDto,
    @Request() req,
  ) {
    const userId = getUserId(req);
    const guide = await this.guidesService.updateGuide(
      id,
      userId,
      updateGuideDto,
    );
    return {
      success: true,
      message: "Guide updated successfully",
      data: guide,
    };
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async publishGuide(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.guidesService.publishGuide(id, userId);
    return {
      success: result.success,
      message: result.success ? "Guide published successfully" : result.error,
      data: { status: result.status },
    };
  }

  @Post(":id/unpublish")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async unpublishGuide(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.guidesService.unpublishGuide(id, userId);
    return {
      success: result.success,
      message: result.success ? "Guide unpublished successfully" : result.error,
      data: { status: result.status },
    };
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async archiveGuide(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.guidesService.archiveGuide(id, userId);
    return {
      success: result.success,
      message: result.success ? "Guide archived successfully" : result.error,
      data: { status: result.status },
    };
  }

  @Post(":id/unarchive")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async unarchiveGuide(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.guidesService.unarchiveGuide(id, userId);
    return {
      success: result.success,
      message: result.success ? "Guide unarchived successfully" : result.error,
      data: { status: result.status },
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async deleteGuide(@Param("id") id: string, @Request() req) {
    const userId = getUserId(req);
    const result = await this.guidesService.deleteGuide(id, userId);
    return {
      success: result.success,
      message: result.success ? "Guide deleted successfully" : result.error,
    };
  }

  @Post(":id/report")
  @HttpCode(HttpStatus.OK)
  async reportGuide(
    @Param("id") id: string,
    @Body() reportGuideDto: ReportGuideDto,
    @Request() req,
  ) {
    const userId = getUserId(req);

    const success = await this.guidesService.reportGuide(
      id,
      reportGuideDto,
      userId,
    );
    return {
      success,
    };
  }

  @Post(":id/report-link")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async reportLink(
    @Param("id") id: string,
    @Body() reportLinkDto: ReportLinkDto,
    @Request() req,
  ) {
    const userId = getUserId(req);

    await this.guidesService.reportLink(id, reportLinkDto, userId);
    return {
      success: true,
      message: "Link report submitted successfully",
    };
  }

  @Post("creator/:creatorId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getGuidesByCreator(
    @Param("creatorId") creatorId: string,
    @Request() req,
  ) {
    const userId = getUserId(req);
    const guides = await this.guidesService.getGuidesByCreator(
      creatorId,
      userId,
    );
    return {
      success: true,
      data: guides,
    };
  }

  @Post("save-guide/:guideId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async toggleSaveGuide(@Param("guideId") guideId: string, @Request() req) {
    const userId = getUserId(req);
    const savedGuide = await this.guidesService.toggleSaveGuide(
      guideId,
      userId,
    );
    return {
      success: true,
      data: savedGuide,
    };
  }

  @Get("is-guide-saved/:guideId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async isGuideSaved(@Param("guideId") guideId: string, @Request() req) {
    const userId = getUserId(req);
    const isSaved = await this.guidesService.isGuideSaved(guideId, userId);
    return {
      success: true,
      data: isSaved,
    };
  }

  @Post("saved-guides")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getSavedGuides(@Request() req) {
    const userId = getUserId(req);
    const savedGuides = await this.guidesService.getSavedGuides(userId);
    return {
      success: true,
      data: savedGuides,
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @UseGuards(ServiceToServiceGuard)
  @Get(":guideId/internal")
  async getGuideForPurchase(@Param("guideId") guideId: string) {
    const guide = await this.guidesService.getGuideForPurchase(guideId);
    return {
      success: true,
      data: guide,
    };
  }

  @Post(":id/purchase/internal")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceToServiceGuard)
  async incrementPurchaseCount(@Param("id") id: string) {
    await this.guidesService.incrementPurchaseCount(id);
    return {
      success: true,
      message: "Purchase count incremented",
    };
  }

  @Get("creator/:creatorId/public/internal")
  @UseGuards(ServiceToServiceGuard)
  async getPublicGuidesByCreator(@Param("creatorId") creatorId: string) {
    const guides = await this.guidesService.getPublicGuidesByCreator(creatorId);
    return {
      success: true,
      data: guides,
    };
  }
}
