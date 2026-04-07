import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { LinkReport, LinkReportDocument } from "./schemas/link-report.schema";
import { sanitizeHtml } from "./utils/sanitization";
import { PROJECT_STATUS } from "./types/projects";
import { slugify } from "./utils/slug";
import { RoleType } from "src/common/types";
import { PurchaseInterface } from "./types/purchase";
import { AccountStatus } from "./types/user";
import { convertSolToLamports } from "./utils/pricing";
import { Project, ProjectDocument } from "./schemas/project.schema";
import {
  ProjectReport,
  ProjectReportDocument,
} from "./schemas/project-report.schema";
import { CreateProjectDto } from "./dto/create-project.dto";

const ALLOWED_PRICES = [7, 12, 19, 29, 49];

@Injectable()
export class ProjectsService {
  private readonly authServiceUrl: string;
  private readonly categoryServiceUrl: string;
  private readonly billingServiceUrl: string;
  private readonly fileServiceUrl: string;

  private readonly accountId: string | undefined;

  constructor(
    @InjectModel(Project.name)
    private projectModel: Model<ProjectDocument>,
    @InjectModel(LinkReport.name)
    private linkReportModel: Model<LinkReportDocument>,
    @InjectModel(ProjectReport.name)
    private projectReportModel: Model<ProjectReportDocument>,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.authServiceUrl =
      this.configService.get<string>("AUTH_SERVICE_URL") || "";
    this.categoryServiceUrl =
      this.configService.get<string>("CATEGORIES_SERVICE_URL") || "";
    this.billingServiceUrl =
      this.configService.get<string>("BILLING_SERVICE_URL") || "";
    this.fileServiceUrl =
      this.configService.get<string>("FILE_SERVICE_URL") || "";
  }

  private async checkIfProjectPurchased(
    projectId: string,
  ): Promise<{ purchased: boolean }> {
    if (!this.billingServiceUrl)
      throw new Error("BILLING_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.billingServiceUrl}/billing/purchases/check-if-project-purchased/${projectId}`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success || !response.data?.data)
      return { purchased: false };

    return response.data.data;
  }

  private extractVideoUidFromUrl(url: string): string | null {
    if (!url) return null;

    if (/^[a-zA-Z0-9_-]+$/.test(url)) {
      return url;
    }

    const streamPattern = /stream\/([a-zA-Z0-9_-]+)/;
    const match = url.match(streamPattern);
    return match ? match[1] : null;
  }

  private async fetchVideoDetails(videoUID: string): Promise<any> {
    if (!this.fileServiceUrl)
      throw new Error("FILE_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    if (!videoUID) return null;

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.fileServiceUrl}/video/${videoUID}/internal`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success || !response.data?.data)
      throw new BadRequestException("Failed to fetch video details");

    const data = response.data?.data || response.data;

    return data;
  }

  private async fetchAccessTokenForMedia(
    videoUid: string,
    expiration?: number,
  ): Promise<{
    hasAccess: boolean;
    videoToken: string;
  }> {
    if (!this.fileServiceUrl)
      throw new Error("FILE_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    if (!videoUid) return { hasAccess: true, videoToken: "" };

    const videoId = videoUid
      ? this.extractVideoUidFromUrl(videoUid)
      : undefined;

    const requestBody: {
      videoUid?: string;
      expiration?: number;
    } = {};

    if (videoId) requestBody.videoUid = videoId;
    if (expiration) requestBody.expiration = expiration;

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.fileServiceUrl}/media/access-token/internal`,
        requestBody,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );
    if (!response.data?.success || !response.data?.data)
      return { hasAccess: false, videoToken: "" };

    const data = response.data?.data || response.data;

    return {
      hasAccess: data.hasAccess === true,
      videoToken: data.videoToken,
    };
  }

  private async fetchSignedPdfUrl(
    pdfKey: string,
    expiration?: number,
  ): Promise<{
    hasAccess: boolean;
    signedPdfUrl: string;
  }> {
    if (!this.fileServiceUrl)
      throw new Error("FILE_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    if (!pdfKey) return { hasAccess: true, signedPdfUrl: "" };

    const requestBody: {
      pdfKey: string;
      expiration?: number;
    } = {
      pdfKey,
    };

    if (expiration) requestBody.expiration = expiration;

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.fileServiceUrl}/media/access-pdf/internal`,
        requestBody,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success || !response.data?.data)
      return { hasAccess: false, signedPdfUrl: "" };

    const data = response.data?.data || response.data;

    return {
      hasAccess: data.hasAccess,
      signedPdfUrl: data.signedPdfUrl,
    };
  }

  private async fetchPurchaseAccess(
    userId: string,
    projectId: string,
  ): Promise<{
    hasAccess: boolean;
    isRefundable: boolean;
    purchase?: PurchaseInterface;
  }> {
    if (!this.billingServiceUrl)
      throw new Error("BILLING_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.billingServiceUrl}/billing/purchases/access/internal?userId=${userId}&projectId=${projectId}`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success || !response.data?.data)
      return { hasAccess: false, isRefundable: false };

    const data = response.data?.data || response.data;

    return {
      hasAccess: data.hasAccess,
      isRefundable: data.isRefundable,
      purchase: data.purchase,
    };
  }

  private async updatePurchaseAccess(
    purchaseId: string,
  ): Promise<PurchaseInterface> {
    if (!this.billingServiceUrl)
      throw new Error("BILLING_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.billingServiceUrl}/billing/purchases/update-access/internal`,
        { purchaseId },
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );
    if (!response.data?.success || !response.data?.data)
      throw new BadRequestException("Failed to update purchase access");

    const data = response.data?.data || response.data;

    return data.purchase;
  }

  private async fetchCategoryById(categoryId: string): Promise<{
    _id: string;
    name: string;
    slug: string;
  } | null> {
    if (!this.categoryServiceUrl)
      throw new Error("CATEGORIES_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.categoryServiceUrl}/categories/${categoryId}/internal`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );
    if (response.data?.success && response.data?.data) {
      const category = response.data.data;
      return {
        _id: category._id?.toString() || categoryId,
        name: category.name,
        slug: category.slug,
      };
    } else throw new Error(`Failed to fetch category by ID ${categoryId}`);
  }

  private async fetchSubcategoryById(subcategoryId: string): Promise<{
    _id: string;
    name: string;
    slug: string;
  } | null> {
    if (!this.categoryServiceUrl)
      throw new Error("CATEGORIES_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.categoryServiceUrl}/subcategories/${subcategoryId}/internal`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );
    if (response.data?.success && response.data?.data) {
      const subcategory = response.data.data;
      return {
        _id: subcategory._id?.toString() || subcategoryId,
        name: subcategory.name,
        slug: subcategory.slug,
      };
    } else
      throw new Error(`Failed to fetch subcategory by ID ${subcategoryId}`);
  }

  private async fetchUserData(userId: string): Promise<{
    _id: string;
    wallet: string;
    profileInfo: {
      username: string;
      email: string;
      roleId: { name: RoleType };
      accountStatus: AccountStatus;
    };
    financialInfo?: {
      stripeVerified?: boolean;
      stripeAccountId?: string;
    };
  } | null> {
    if (!this.authServiceUrl)
      throw new Error("AUTH_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(`${this.authServiceUrl}/users/${userId}/internal`, {
        headers: {
          "x-internal-secret": internalSecret,
        },
      }),
    );

    if (response.data?.success && response.data?.data) {
      const user = response.data.data;
      return {
        _id: user._id?.toString() || userId,
        wallet: user.wallet,
        profileInfo: {
          username: user.profileInfo?.username,
          email: user.profileInfo?.email || user.email,
          roleId: user.profileInfo?.roleId,
          accountStatus: user.profileInfo?.accountStatus,
        },
        financialInfo: {
          stripeVerified: user.financialInfo?.stripeVerified,
          stripeAccountId: user.financialInfo?.stripeAccountId,
        },
      };
    } else throw new Error(`Failed to fetch user data for userId ${userId}`);
  }

  private async makeMediaPublished(
    mediaId: string,
    userId: string,
    mediaType: "video" | "image" | "file",
  ): Promise<{ success: boolean; message: string }> {
    if (!this.fileServiceUrl)
      throw new Error("FILE_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.fileServiceUrl}/${mediaType}/make-media-published/internal`,
        { mediaId: mediaId, userId: userId },
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success)
      throw new BadRequestException("Failed to make media published");

    return response.data.data;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = slugify(title) || `project-${Date.now()}`;

    let slug = baseSlug;
    let counter = 1;

    while (await this.projectModel.exists({ slug })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  private validateProject(dto: CreateProjectDto): void {
    // Validate that required fields are not being set to empty values
    const errors: string[] = [];

    if (dto.title !== undefined && (!dto.title || !dto.title.trim()))
      errors.push("Title is required");

    if (
      dto.description !== undefined &&
      (!dto.description || !dto.description.trim())
    )
      errors.push("Description is required");

    if (dto.category !== undefined && !dto.category)
      errors.push("Category is required");

    if (
      dto.contentLanguage !== undefined &&
      (!dto.contentLanguage || !dto.contentLanguage.trim())
    )
      errors.push("Content language is required");

    if (dto.price !== undefined && (dto.price === null || dto.price < 0))
      errors.push("Price is required and must be 0 or greater");

    if (
      dto.media?.mainVideo !== undefined &&
      (!dto.media.mainVideo || !dto.media.mainVideo.trim())
    )
      errors.push("Main project video is required");

    if (
      dto.estimatedDurationMinutes !== undefined &&
      dto.estimatedDurationMinutes !== null &&
      dto.estimatedDurationMinutes < 0
    ) {
      errors.push("Estimated duration must be 0 or greater");
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }
  }

  async createProject(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectDocument> {
    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
      throw new ForbiddenException(
        "You are not authorized to create a project",
      );

    if (
      user.financialInfo?.stripeVerified !== true ||
      user.financialInfo?.stripeAccountId === null ||
      user.financialInfo?.stripeAccountId === undefined
    )
      throw new ForbiddenException(
        "You are not authorized to create a project because you are not verified as a creator or you do not have a stripe account.",
      );

    if (!ALLOWED_PRICES.includes(dto.price))
      throw new BadRequestException(
        "Invalid price tier. Please select a valid price tier.",
      );

    const sanitizedDescription = sanitizeHtml(dto.description);

    const slug = await this.generateUniqueSlug(dto.title);

    const media = {
      previewVideo: dto.media.previewVideo,
      mainVideo: dto.media.mainVideo,
      images: dto.media.images || [],
      projectFile: dto.media.projectFile || null,
      thumbnailId: dto.media.thumbnailId || null,
    };

    const project = new this.projectModel({
      ...dto,
      status: PROJECT_STATUS.DRAFT,
      description: sanitizedDescription,
      category: new Types.ObjectId(dto.category),
      subcategories: new Types.ObjectId(dto.subcategory),
      price: convertSolToLamports(dto.price),
      media,
      creatorId: new Types.ObjectId(userId),
      creatorWallet: user.wallet,
      slug,
      publishedAt: null,
      lastEditedAt: new Date(),
    });

    const savedProject = await project.save();

    await this.makeMediaPublished(dto.media.mainVideo, userId, "video");

    if (dto.media.previewVideo) {
      await this.makeMediaPublished(dto.media.previewVideo, userId, "video");
    }

    if (dto.media.projectFile) {
      await this.makeMediaPublished(dto.media.projectFile, userId, "file");
    }
    if (dto.media.images && dto.media.images.length > 0) {
      for (const image of dto.media.images) {
        await this.makeMediaPublished(image, userId, "image");
      }
    }

    return savedProject;
  }

  // async getProjectMetadataBySlug(
  //   slug: string,
  // ): Promise<MetadataProjectResponse> {
  //   const project = await this.projectModel
  //     .findOne(
  //       {
  //         slug,
  //         status: PROJECT_STATUS.PUBLISHED,
  //       },
  //       {
  //         _id: 1,
  //         title: 1,
  //         description: 1,
  //         category: 1,
  //         slug: 1,
  //         media: {
  //           thumbnailId: 1,
  //           images: 1,
  //         },
  //         visibility: 1,
  //         estimatedDurationMinutes: 1,
  //         mainCreatorSnapshot: 1,
  //         contentLanguage: 1,
  //         safetyNotes: 1,
  //         price: 1,
  //         currency: 1,
  //         createdAt: 1,
  //       },
  //     )
  //     .lean<MetadataProjectResponse>()
  //     .exec();

  //   if (project && project.category) {
  //     const categoryData = await this.fetchCategoryById(
  //       project.category.toString(),
  //     );
  //     if (categoryData) project.category = categoryData;
  //   }

  //   if (!project)
  //     throw new NotFoundException(`Project with slug ${slug} not found`);
  //   return project;
  // }

  // async getPublicProjectsForSitemap(): Promise<
  //   { slug: string; createdAt: Date; updatedAt: Date }[]
  // > {
  //   const projects = await this.projectModel
  //     .find(
  //       {
  //         status: PROJECT_STATUS.PUBLISHED,
  //       },
  //       {
  //         slug: 1,
  //         createdAt: 1,
  //         updatedAt: 1,
  //         _id: 0,
  //       },
  //     )
  //     .lean<{ slug: string; createdAt: Date; updatedAt: Date }[]>() // 👈 ARRAY
  //     .sort({ createdAt: -1 })
  //     .exec();

  //   return projects;
  // }

  // async updateGuide(
  //   id: string,
  //   userId: string,
  //   dto: UpdateProjectDto,
  // ): Promise<ProjectDocument> {
  //   const isPurchased = await this.checkIfProjectPurchased(id);
  //   if (isPurchased.purchased)
  //     throw new BadRequestException(
  //       `Project has been purchased and cannot be updated`,
  //     );

  //   const user = await this.fetchUserData(userId);
  //   if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

  //   if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
  //     throw new ForbiddenException(
  //       "You are not authorized to update a project",
  //     );

  //   if (
  //     user.financialInfo?.stripeVerified !== true ||
  //     user.financialInfo?.stripeAccountId === null ||
  //     user.financialInfo?.stripeAccountId === undefined
  //   )
  //     throw new ForbiddenException(
  //       "You are not authorized to update a project because you are not verified as a creator or you do not have a stripe account.",
  //     );

  //   const project = await this.projectModel.findById(id).exec();

  //   if (!project)
  //     throw new NotFoundException(`Project with ID ${id} not found`);

  //   this.validateProject(dto);

  //   const update: Record<string, any> = {};

  //   if (dto.difficulty !== undefined) update.difficulty = dto.difficulty;
  //   if (dto.title !== undefined) {
  //     update.title = dto.title;
  //     update.slug = await this.generateUniqueSlug(dto.title);
  //   }
  //   if (dto.description !== undefined)
  //     update.description = sanitizeHtml(dto.description);
  //   if (dto.category !== undefined)
  //     update.category = new Types.ObjectId(dto.category);
  //   if (dto.subcategories !== undefined)
  //     update.subcategories = dto.subcategories.map(
  //       (id) => new Types.ObjectId(id),
  //     );
  //   if (dto.tags !== undefined) update.tags = dto.tags;
  //   if (dto.visibility !== undefined) update.visibility = dto.visibility;
  //   if (dto.contentLanguage !== undefined)
  //     update.contentLanguage = dto.contentLanguage;
  //   if (dto.monetizationType !== undefined)
  //     update.monetizationType = dto.monetizationType;
  //   if (dto.price !== undefined) update.price = convertSolToLamports(dto.price);

  //   if (dto.media?.previewVideo?.streamId !== undefined)
  //     update["media.previewVideo"] = dto.media.previewVideo;
  //   if (dto.media?.mainVideo?.streamId !== undefined)
  //     update["media.mainVideo"] = dto.media.mainVideo;
  //   if (dto.media?.projectFile?.fileKey !== undefined)
  //     update["media.projectFile"] = dto.media.projectFile;
  //   if (dto.media?.thumbnailId !== undefined)
  //     update["media.thumbnailId"] = dto.media.thumbnailId;
  //   if (dto.media?.images !== undefined)
  //     update["media.images"] = dto.media.images;

  //   if (dto.tools !== undefined)
  //     update.tools = dto.tools.map((tool) => ({
  //       name: tool.name,
  //       link: tool.link,
  //     }));

  //   if (dto.materials !== undefined)
  //     update.materials = dto.materials.map((material) => ({
  //       name: material.name,
  //       link: material.link,
  //     }));

  //   if (dto.safetyNotes !== undefined) update.safetyNotes = dto.safetyNotes;
  //   if (dto.estimatedDurationMinutes !== undefined)
  //     update.estimatedDurationMinutes = dto.estimatedDurationMinutes;

  //   await this.runModerationCheckForUpdate(dto);

  //   const updatedProject = await this.projectModel.findByIdAndUpdate(
  //     id,
  //     { $set: { ...update, lastEditedAt: new Date() } },
  //     { new: true, runValidators: true },
  //   );

  //   return updatedProject as unknown as ProjectDocument;
  // }

  // async findPublicExploreProjects({
  //   page,
  //   limit,
  //   sortBy,
  //   sortOrder,
  //   categoryId,
  //   subcategoryId,
  //   search,
  //   difficulty,
  //   price,
  //   duration,
  // }: {
  //   page: number;
  //   limit: number;
  //   sortBy: string;
  //   sortOrder: "asc" | "desc";
  //   categoryId?: string;
  //   subcategoryId?: string;
  //   search?: string;
  //   difficulty?: DIFFICULTY;
  //   price?: string;
  //   duration?: string;
  // }) {
  //   const query: any = {
  //     visibility: VISIBILITY_TYPE.PUBLIC,
  //     status: GUIDE_STATUS.PUBLISHED,
  //   };

  //   if (categoryId) query.category = new Types.ObjectId(categoryId);

  //   if (subcategoryId) query.subcategories = new Types.ObjectId(subcategoryId);

  //   if (difficulty) query.difficulty = difficulty;

  //   if (search)
  //     query.$or = [
  //       { title: { $regex: search, $options: "i" } },
  //       { description: { $regex: search, $options: "i" } },
  //       { tags: { $regex: search, $options: "i" } },
  //     ];

  //   if (price) {
  //     if (price.startsWith("lt-")) {
  //       query.price = { $lt: Number(price.replace("lt-", "")) };
  //     } else if (price.startsWith("gt-")) {
  //       query.price = { $gt: Number(price.replace("gt-", "")) };
  //     } else if (price.startsWith("btw-")) {
  //       const [min, max] = price.replace("btw-", "").split("-").map(Number);
  //       query.price = { $gte: min, $lte: max };
  //     }
  //   }

  //   if (duration) {
  //     if (duration.startsWith("lt-")) {
  //       query.estimatedDurationMinutes = {
  //         $lt: Number(duration.replace("lt-", "")),
  //       };
  //     } else if (duration.startsWith("gt-")) {
  //       query.estimatedDurationMinutes = {
  //         $gt: Number(duration.replace("gt-", "")),
  //       };
  //     } else if (duration.startsWith("btw-")) {
  //       const [min, max] = duration.replace("btw-", "").split("-").map(Number);
  //       query.estimatedDurationMinutes = { $gte: min, $lte: max };
  //     }
  //   }

  //   const sort: any = {};
  //   switch (sortBy) {
  //     case "price":
  //       sort.price = sortOrder === "asc" ? 1 : -1;
  //       break;
  //     case "purchaseCount":
  //       sort.purchaseCount = sortOrder === "asc" ? 1 : -1;
  //       break;
  //     default:
  //       sort.createdAt = sortOrder === "asc" ? 1 : -1;
  //   }

  //   const skip = (page - 1) * limit;

  //   const [projects, total] = await Promise.all([
  //     this.projectModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
  //     this.projectModel.countDocuments(query),
  //   ]);

  //   return {
  //     success: true,
  //     data: projects,
  //     meta: {
  //       page,
  //       limit,
  //       total,
  //       totalPages: Math.ceil(total / limit),
  //     },
  //   };
  // }

  // async getProjectBySlug(
  //   slug: string,
  //   user: { id: string; role?: string } | null,
  // ): Promise<ProjectResponse> {
  //   const project: any = await this.projectModel
  //     .findOne({ slug })
  //     .lean()
  //     .exec();

  //   if (!project)
  //     throw new NotFoundException(`Project with slug ${slug} not found.`);

  //   if (project.category) {
  //     const categoryData = await this.fetchCategoryById(
  //       project.category.toString(),
  //     );
  //     if (categoryData) project.category = categoryData;
  //   }

  //   if (
  //     Array.isArray(project.subcategories) &&
  //     project.subcategories.length > 0
  //   ) {
  //     const subcategoriesData = (
  //       await Promise.all(
  //         project.subcategories.map((id) =>
  //           this.fetchSubcategoryById(id.toString()),
  //         ),
  //       )
  //     ).filter(Boolean);
  //     project.subcategories = subcategoriesData;
  //   }

  //   // Ownership
  //   const isOwner =
  //     user !== null && project.mainCreator?.toString() === user.id;

  //   // Purchase access
  //   let hasAccess = false;
  //   let isRefundable = false;

  //   if (user && !isOwner) {
  //     const purchaseAccess = await this.fetchPurchaseAccess(
  //       user.id,
  //       project._id,
  //     );

  //     hasAccess = purchaseAccess.hasAccess;
  //     isRefundable = purchaseAccess.isRefundable;
  //   }

  //   // Access level
  //   let accessLevel = ACCESS_LEVEL.PREVIEW;

  //   if (isOwner) accessLevel = ACCESS_LEVEL.OWNER;
  //   if (hasAccess) accessLevel = ACCESS_LEVEL.FULL;

  //   const fullAccess =
  //     accessLevel === ACCESS_LEVEL.FULL || accessLevel === ACCESS_LEVEL.OWNER;

  //   let playbackUrl: string | undefined;
  //   let requiresToken = false;

  //   if (
  //     project.status !== PROJECT_STATUS.PUBLISHED &&
  //     !isOwner &&
  //     !hasAccess &&
  //     !fullAccess
  //   )
  //     throw new ForbiddenException("This project is not published.");

  //   if (
  //     accessLevel === ACCESS_LEVEL.PREVIEW &&
  //     project.media?.previewVideo?.streamId
  //   ) {
  //     playbackUrl = `https://videodelivery.net/${project.media.previewVideo.streamId}/manifest/video.m3u8`;
  //   }

  //   if (fullAccess && project.media?.mainVideo?.streamId) {
  //     playbackUrl = `https://videodelivery.net/${project.media.mainVideo?.streamId}/manifest/video.m3u8`;
  //     requiresToken = true;
  //   }

  //   const responseProject: PublicProjectResponse = {
  //     _id: project._id,
  //     title: project.title,
  //     description: project.description,
  //     difficulty: project.difficulty,
  //     estimatedDurationMinutes: project.estimatedDurationMinutes,
  //     contentLanguage: project.contentLanguage,
  //     price: project.price,
  //     monetizationType: project.monetizationType,
  //     visibility: project.visibility,
  //     status: project.status,
  //     tags: project.tags,
  //     literature: fullAccess ? project.literature : [],
  //     category: project.category,
  //     subcategories: project.subcategories,
  //     mainCreator: project.mainCreator,
  //     mainCreatorSnapshot: project.mainCreatorSnapshot,
  //     projectType: project.projectType,
  //     createdAt: project.createdAt,
  //     updatedAt: project.updatedAt,
  //     slug: project.slug,
  //     currency: project.currency,
  //     purchaseCount: project.purchaseCount,
  //     publishedAt: project.publishedAt,
  //     media: {
  //       thumbnailId: project.media?.thumbnailId,
  //       images: project.media?.images,
  //       hasPdf: Boolean(project.media?.guideFile?.fileKey),
  //       ...(playbackUrl && {
  //         video: {
  //           playbackUrl,
  //           requiresToken,
  //         },
  //       }),
  //     },
  //   };

  //   let signedAssets: ProjectResponse["signedAssets"] | undefined;

  //   if (requiresToken) {
  //     const accessToken = await this.fetchAccessTokenForMedia(
  //       project.media?.mainVideo?.streamId,
  //     );
  //     signedAssets = {
  //       videoToken: accessToken.videoToken,
  //     };
  //   }

  //   let isPurchasable = true;
  //   if (project.status !== PROJECT_STATUS.PUBLISHED) isPurchasable = false;

  //   const creator = await this.fetchUserData(project.mainCreator.toString());

  //   if (creator?.profileInfo.accountStatus !== AccountStatus.ACTIVE)
  //     isPurchasable = false;

  //   return {
  //     project: responseProject,
  //     access: {
  //       level: accessLevel,
  //       isOwner,
  //       canWatch: fullAccess,
  //       canDownloadPdf: fullAccess,
  //       isPurchasable,
  //       isRefundable,
  //     },
  //     ...(signedAssets ? { signedAssets } : {}),
  //   };
  // }

  // async accessProjectPdf(userId: string, projectId: string) {
  //   const purchase = await this.fetchPurchaseAccess(userId, projectId);

  //   const project = await this.projectModel.findById(projectId).lean();
  //   if (!project?.media?.projectFile?.fileKey)
  //     throw new BadRequestException("PDF not found");

  //   if (userId.toString() === project.mainCreator.toString()) {
  //     const signedUrl = await this.fetchSignedPdfUrl(
  //       project.media.projectFile.fileKey,
  //     );

  //     if (!signedUrl.hasAccess)
  //       throw new BadRequestException("Failed to generate signed PDF URL");

  //     return {
  //       success: true,
  //       url: signedUrl,
  //     };
  //   }

  //   if (!purchase) throw new ForbiddenException("Project not purchased");

  //   if (!purchase.purchase?.pdfAvailable) {
  //     throw new BadRequestException("Project has no PDF");
  //   }

  //   if (!purchase.purchase?.pdfAccessed)
  //     await this.updatePurchaseAccess(purchase.purchase._id.toString());

  //   const signedUrl = await this.fetchSignedPdfUrl(
  //     project.media.projectFile.fileKey,
  //   );

  //   if (!signedUrl.hasAccess)
  //     throw new BadRequestException("Failed to generate signed PDF URL");

  //   return {
  //     success: true,
  //     url: signedUrl,
  //   };
  // }

  // async getProjectForEditing(
  //   slug: string,
  //   user: { id: string; role?: string } | null,
  // ): Promise<ProjectInterface> {
  //   if (user && user.role !== RoleType.CREATOR)
  //     throw new ForbiddenException({
  //       code: "FORBIDDEN",
  //       title: "Unauthorized",
  //       message: "You are not authorized to edit this project",
  //     });

  //   const project: any = await this.projectModel
  //     .findOne({ slug, mainCreator: new Types.ObjectId(user?.id) })
  //     .lean()
  //     .exec();

  //   if (!project)
  //     throw new NotFoundException(`Project with slug ${slug} not found.`);

  //   if (project.category) {
  //     const categoryData = await this.fetchCategoryById(
  //       project.category.toString(),
  //     );
  //     if (categoryData) project.category = categoryData;
  //   }

  //   if (
  //     Array.isArray(project.subcategories) &&
  //     project.subcategories.length > 0
  //   ) {
  //     const subcategoriesData = (
  //       await Promise.all(
  //         guide.subcategories.map((id) =>
  //           this.fetchSubcategoryById(id.toString()),
  //         ),
  //       )
  //     ).filter(Boolean);
  //     guide.subcategories = subcategoriesData;
  //   }

  //   // Ownership
  //   const isOwner = user !== null && guide.mainCreator?.toString() === user.id;

  //   if (!isOwner)
  //     throw new ForbiddenException({
  //       code: "FORBIDDEN",
  //       message: "You do not have access to this guide.",
  //     });

  //   return guide;
  // }

  // async publishGuide(
  //   id: string,
  //   userId: string,
  // ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
  //   const user = await this.fetchUserData(userId);
  //   if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

  //   if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
  //     return { success: false, error: "You are not a creator." };

  //   if (
  //     user.financialInfo?.stripeVerified !== true ||
  //     user.financialInfo?.stripeAccountId === null ||
  //     user.financialInfo?.stripeAccountId === undefined
  //   )
  //     return {
  //       success: false,
  //       error:
  //         "You are not authorized to publish a guide because you are not verified as a creator or you do not have a stripe account.",
  //     };

  //   const existingGuide = await this.guideModel
  //     .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
  //     .exec();

  //   if (!existingGuide)
  //     return {
  //       success: false,
  //       error: "Guide not found or you are not the owner",
  //     };

  //   const updatedGuide = await this.guideModel.findByIdAndUpdate(
  //     id,
  //     {
  //       $set: {
  //         status: GUIDE_STATUS.PUBLISHED,
  //         publishedAt: new Date(),
  //         lastEditedAt: new Date(),
  //       },
  //     },
  //     { new: true, runValidators: true },
  //   );

  //   return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  // }

  // async unpublishGuide(
  //   id: string,
  //   userId: string,
  // ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
  //   const isPurchased = await this.checkIfGuidePurchased(id);
  //   if (isPurchased.purchased)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be unpublished`,
  //     };

  //   const existingGuide = await this.guideModel
  //     .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
  //     .exec();

  //   if (!existingGuide)
  //     return {
  //       success: false,
  //       error: `Guide not found or you are not the owner`,
  //     };

  //   if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be unpublished`,
  //     };

  //   const updatedGuide = await this.guideModel.findByIdAndUpdate(
  //     id,
  //     {
  //       $set: {
  //         status: GUIDE_STATUS.DRAFT,
  //         unpublishedAt: new Date(),
  //         lastEditedAt: new Date(),
  //       },
  //     },
  //     { new: true, runValidators: true },
  //   );

  //   return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  // }

  // async archiveGuide(
  //   id: string,
  //   userId: string,
  // ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
  //   const isPurchased = await this.checkIfGuidePurchased(id);
  //   if (isPurchased.purchased)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be archived`,
  //     };

  //   const existingGuide = await this.guideModel
  //     .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
  //     .exec();

  //   if (!existingGuide)
  //     return {
  //       success: false,
  //       error: `Guide not found or you are not the owner`,
  //     };

  //   if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be archived`,
  //     };

  //   const updatedGuide = await this.guideModel.findByIdAndUpdate(
  //     id,
  //     {
  //       $set: {
  //         status: GUIDE_STATUS.ARCHIVED,
  //         archivedAt: new Date(),
  //         lastEditedAt: new Date(),
  //       },
  //     },
  //     { new: true, runValidators: true },
  //   );

  //   return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  // }

  // async unarchiveGuide(
  //   id: string,
  //   userId: string,
  // ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
  //   const existingGuide = await this.guideModel
  //     .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
  //     .exec();

  //   if (!existingGuide)
  //     return {
  //       success: false,
  //       error: `Guide not found or you are not the owner`,
  //     };

  //   const updatedGuide = await this.guideModel.findByIdAndUpdate(
  //     id,
  //     {
  //       $set: {
  //         status: GUIDE_STATUS.DRAFT,
  //         unarchivedAt: new Date(),
  //         lastEditedAt: new Date(),
  //       },
  //     },
  //     { new: true, runValidators: true },
  //   );

  //   return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  // }

  // async deleteGuide(
  //   id: string,
  //   userId: string,
  // ): Promise<{ success: boolean; error?: string }> {
  //   const isPurchased = await this.checkIfGuidePurchased(id);
  //   if (isPurchased.purchased)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be deleted`,
  //     };

  //   const existingGuide = await this.guideModel
  //     .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
  //     .exec();

  //   if (!existingGuide)
  //     return {
  //       success: false,
  //       error: `Guide not found or you are not the owner`,
  //     };

  //   if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
  //     return {
  //       success: false,
  //       error: `Guide has been purchased and cannot be deleted`,
  //     };

  //   if (existingGuide.publishedAt && existingGuide.publishedAt !== null)
  //     return {
  //       success: false,
  //       error: `Guide has already been published and cannot be deleted`,
  //     };

  //   const result = await this.guideModel.deleteOne({ _id: id });

  //   return {
  //     success: result.deletedCount === 1,
  //   };
  // }

  // async reportGuide(
  //   guideId: string,
  //   dto: ReportGuideDto,
  //   userId: string,
  // ): Promise<boolean> {
  //   const guide = await this.guideModel.findById(guideId).exec();
  //   if (!guide)
  //     throw new NotFoundException(`Guide with ID ${guideId} not found`);

  //   if (guide.mainCreator?.toString() === userId)
  //     throw new ForbiddenException("You cannot report your own guide.");

  //   const report = new this.guideReportModel({
  //     guideId: new Types.ObjectId(guideId),
  //     userId: new Types.ObjectId(userId),
  //     reason: dto.reason,
  //     message: dto.message,
  //     reportedAt: new Date(),
  //   });

  //   const savedReport = await report.save();
  //   if (!savedReport) return false;
  //   return true;
  // }

  // async reportLink(
  //   guideId: string,
  //   dto: ReportLinkDto,
  //   userId: string,
  // ): Promise<boolean> {
  //   const guide = await this.guideModel.findById(guideId).exec();
  //   if (!guide)
  //     throw new NotFoundException(`Guide with ID ${guideId} not found`);

  //   if (guide.mainCreator?.toString() === userId)
  //     throw new ForbiddenException("You cannot report your own link.");

  //   const report = new this.linkReportModel({
  //     guideId: new Types.ObjectId(guideId),
  //     linkItemId: new Types.ObjectId(dto.linkItemId),
  //     linkType: dto.linkType,
  //     link: dto.link,
  //     userId: new Types.ObjectId(userId),
  //     reason: dto.reason,
  //     reportedAt: new Date(),
  //   });

  //   const savedReport = await report.save();
  //   if (!savedReport) return false;
  //   return true;
  // }

  // getAllGuides(categoryId?: string): Promise<GuideDocument[]> {
  //   const query: any = {};
  //   if (categoryId) {
  //     query.category = new Types.ObjectId(categoryId);
  //   }
  //   return this.guideModel.find(query).sort({ createdAt: -1 }).exec();
  // }

  // async getGuidesByCreator(
  //   creatorId: string,
  //   userId: string,
  // ): Promise<GuideDocument[] | null> {
  //   const user = await this.fetchUserData(userId);

  //   if (user?.profileInfo?.roleId?.name !== RoleType.CREATOR)
  //     throw new ForbiddenException(
  //       "You are not authorized to access this resource",
  //     );

  //   if (creatorId !== userId)
  //     throw new ForbiddenException(
  //       "You are not authorized to access guides created by other creators",
  //     );

  //   const guides = await this.guideModel
  //     .find({ mainCreator: new Types.ObjectId(creatorId) })
  //     .sort({ createdAt: -1 })
  //     .exec();

  //   if (guides.length === 0) return null;
  //   return guides;
  // }

  // getPublicGuidesByCreator(creatorId: string): Promise<GuideDocument[]> {
  //   return this.guideModel
  //     .find({
  //       mainCreator: new Types.ObjectId(creatorId),
  //       visibility: VISIBILITY_TYPE.PUBLIC,
  //       status: GUIDE_STATUS.PUBLISHED,
  //     })
  //     .sort({ createdAt: -1 })
  //     .exec();
  // }

  // async toggleSaveGuide(
  //   guideId: string,
  //   userId: string,
  // ): Promise<{ saved: boolean }> {
  //   const existingSavedGuide = await this.savedGuideModel.deleteOne({
  //     guideId: new Types.ObjectId(guideId),
  //     userId: new Types.ObjectId(userId),
  //   });

  //   if (existingSavedGuide.deletedCount > 0) return { saved: false };

  //   const newSavedGuide = await this.savedGuideModel.create({
  //     guideId: new Types.ObjectId(guideId),
  //     userId: new Types.ObjectId(userId),
  //   });

  //   if (!newSavedGuide)
  //     throw new BadRequestException({
  //       code: "FAILED_TO_SAVE_GUIDE",
  //       message: "Failed to save guide",
  //     });

  //   return { saved: true };
  // }

  // async isGuideSaved(guideId: string, userId: string): Promise<boolean> {
  //   const savedGuide = await this.savedGuideModel
  //     .findOne({
  //       guideId: new Types.ObjectId(guideId),
  //       userId: new Types.ObjectId(userId),
  //     })
  //     .exec();

  //   return savedGuide ? true : false;
  // }

  // async getSavedGuides(userId: string): Promise<SavedGuideDocument[]> {
  //   const userObjectId = new Types.ObjectId(userId);

  //   const pipeline: PipelineStage[] = [
  //     // 1. Only this user's saved guides
  //     {
  //       $match: {
  //         userId: userObjectId,
  //       },
  //     },
  //     // 2. Join guides
  //     {
  //       $lookup: {
  //         from: "guides",
  //         localField: "guideId",
  //         foreignField: "_id",
  //         as: "guide",
  //       },
  //     },
  //     // 3. Flatten
  //     {
  //       $unwind: "$guide",
  //     },
  //     // 4. Only visible + published guides
  //     {
  //       $match: {
  //         "guide.status": GUIDE_STATUS.PUBLISHED,
  //         "guide.visibility": VISIBILITY_TYPE.PUBLIC,
  //       },
  //     },
  //     // 5. Shape response for Saved Guides UI
  //     {
  //       $project: {
  //         _id: 0,
  //         savedAt: "$createdAt",
  //         guideId: "$guide._id",
  //         slug: "$guide.slug",
  //         title: "$guide.title",
  //         price: "$guide.price",
  //         currency: "$guide.currency",
  //         difficulty: "$guide.difficulty",
  //         estimatedDurationMinutes: "$guide.estimatedDurationMinutes",
  //         media: {
  //           thumbnailId: "$guide.media.thumbnailId",
  //         },
  //         mainCreatorSnapshot: "$guide.mainCreatorSnapshot",
  //       },
  //     },
  //     // 6. Most recently saved first
  //     {
  //       $sort: {
  //         savedAt: -1,
  //       },
  //     },
  //   ];

  //   const savedGuides = await this.savedGuideModel.aggregate(pipeline).exec();

  //   return savedGuides;
  // }

  // ///
  // /// ----------------------------- ADMIN FACING METHODS -----------------------------
  // ///

  // async findAdminGuides({
  //   page,
  //   limit,
  //   sortBy,
  //   sortOrder,
  //   status,
  //   visibility,
  //   search,
  // }: {
  //   page: number;
  //   limit: number;
  //   sortBy: string;
  //   sortOrder: "asc" | "desc";
  //   status?: GUIDE_STATUS;
  //   visibility?: VISIBILITY_TYPE;
  //   search?: string;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;
  //   if (visibility) query["visibility"] = visibility;

  //   if (search) {
  //     query.$or = [
  //       { title: { $regex: search, $options: "i" } },
  //       { description: { $regex: search, $options: "i" } },
  //     ];
  //   }

  //   const sort: any = {};
  //   sort[sortBy === "createdAt" ? "createdAt" : "updatedAt"] =
  //     sortOrder === "asc" ? 1 : -1;

  //   const skip = (page - 1) * limit;

  //   const [guides, total] = await Promise.all([
  //     this.guideModel.aggregate([
  //       { $match: query },

  //       {
  //         $lookup: {
  //           from: "guide_reports",
  //           let: { guideId: "$_id" },
  //           pipeline: [
  //             {
  //               $match: {
  //                 $expr: { $eq: ["$guideId", "$$guideId"] },
  //                 status: GuideReportStatus.ACCEPTED,
  //               },
  //             },
  //             { $count: "count" },
  //           ],
  //           as: "reportData",
  //         },
  //       },

  //       {
  //         $addFields: {
  //           acceptedReportCount: {
  //             $ifNull: [{ $arrayElemAt: ["$reportData.count", 0] }, 0],
  //           },
  //         },
  //       },

  //       {
  //         $project: {
  //           reportData: 0,
  //         },
  //       },

  //       {
  //         $lookup: {
  //           from: "guide_link_reports",
  //           let: { guideId: "$_id" },
  //           pipeline: [
  //             {
  //               $match: {
  //                 $expr: { $eq: ["$guideId", "$$guideId"] },
  //                 status: GuideLinkReportStatus.ACCEPTED,
  //               },
  //             },
  //             {
  //               $group: {
  //                 _id: "$linkItemId",
  //                 count: { $sum: 1 },
  //               },
  //             },
  //           ],
  //           as: "acceptedLinkReportStats",
  //         },
  //       },

  //       {
  //         $addFields: {
  //           acceptedLinkReportStats: {
  //             $map: {
  //               input: "$acceptedLinkReportStats",
  //               as: "stat",
  //               in: {
  //                 linkItemId: "$$stat._id",
  //                 count: "$$stat.count",
  //               },
  //             },
  //           },
  //         },
  //       },

  //       { $sort: sort },
  //       { $skip: skip },
  //       { $limit: limit },
  //     ]),

  //     this.guideModel.countDocuments(query),
  //   ]);

  //   return {
  //     success: true,
  //     data: guides,
  //     meta: {
  //       page,
  //       limit,
  //       total,
  //       totalPages: Math.ceil(total / limit),
  //     },
  //   };
  // }

  // async findAdminGuideReports({
  //   page,
  //   limit,
  //   sortBy,
  //   sortOrder,
  //   status,
  //   reason,
  // }: {
  //   page: number;
  //   limit: number;
  //   sortBy: string;
  //   sortOrder: "asc" | "desc";
  //   status?: GuideReportStatus;
  //   reason?: GuideReportReason;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;
  //   if (reason) query["reason"] = reason;

  //   const sort: any = {};
  //   sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
  //     sortOrder === "asc" ? -1 : 1;

  //   const skip = (page - 1) * limit;

  //   const [reports, total] = await Promise.all([
  //     this.guideReportModel
  //       .find(query)
  //       .sort(sort)
  //       .skip(skip)
  //       .populate("guideId", "title description slug")
  //       .limit(limit)
  //       .lean(),
  //     this.guideReportModel.countDocuments(query),
  //   ]);

  //   return {
  //     success: true,
  //     data: reports,
  //     meta: {
  //       page,
  //       limit,
  //       total,
  //       totalPages: Math.ceil(total / limit),
  //     },
  //   };
  // }

  // async findAdminGuideLinkReports({
  //   page,
  //   limit,
  //   sortBy,
  //   sortOrder,
  //   status,
  //   reason,
  // }: {
  //   page: number;
  //   limit: number;
  //   sortBy: string;
  //   sortOrder: "asc" | "desc";
  //   status?: GuideLinkReportStatus;
  //   reason?: GuideLinkReportReason;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;
  //   if (reason) query["reason"] = reason;

  //   const sort: any = {};
  //   sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
  //     sortOrder === "asc" ? -1 : 1;

  //   const skip = (page - 1) * limit;

  //   const [reports, total] = await Promise.all([
  //     this.linkReportModel
  //       .find(query)
  //       .sort(sort)
  //       .skip(skip)
  //       .populate("guideId", "title description slug")
  //       .limit(limit)
  //       .lean(),
  //     this.linkReportModel.countDocuments(query),
  //   ]);

  //   return {
  //     success: true,
  //     data: reports,
  //     meta: {
  //       page,
  //       limit,
  //       total,
  //       totalPages: Math.ceil(total / limit),
  //     },
  //   };
  // }

  // async updateGuideStatus(guideId: string, status: GUIDE_STATUS) {
  //   const guide = await this.guideModel
  //     .findByIdAndUpdate(guideId, { status }, { new: true })
  //     .exec();

  //   if (!guide) throw new NotFoundException(`Guide not found`);

  //   return guide;
  // }

  // async takeGuideReportAction(
  //   reportId: string,
  //   status: GuideReportStatus,
  // ): Promise<GuideReportDocument> {
  //   const report = await this.guideReportModel.findByIdAndUpdate(
  //     reportId,
  //     {
  //       status,
  //     },
  //     { new: true },
  //   );

  //   if (!report) throw new NotFoundException("Guide report not found");
  //   return report;
  // }

  // async disableLink(
  //   guideId: string,
  //   linkItemId: string,
  //   linkType: GuideLinkType,
  // ) {
  //   const field = linkType === GuideLinkType.TOOL ? "tools" : "materials";

  //   await this.guideModel.updateOne(
  //     { _id: guideId },
  //     {
  //       $set: {
  //         [`${field}.$[elem].isLinkDisabled`]: true,
  //       },
  //     },
  //     {
  //       arrayFilters: [{ "elem._id": new Types.ObjectId(linkItemId) }],
  //     },
  //   );
  // }

  // async takeGuideLinkReportAction(
  //   reportId: string,
  //   status: GuideLinkReportStatus,
  // ): Promise<LinkReportDocument> {
  //   const report = await this.linkReportModel.findById(reportId);

  //   if (!report) throw new NotFoundException("Guide link report not found");

  //   if (report.status === status) return report;

  //   report.status = status;
  //   await report.save();

  //   if (status === GuideLinkReportStatus.ACCEPTED) {
  //     const FLAG_THRESHOLD = 5;

  //     const acceptedCount = await this.linkReportModel.countDocuments({
  //       guideId: report.guideId,
  //       linkItemId: report.linkItemId,
  //       status: GuideLinkReportStatus.ACCEPTED,
  //     });

  //     if (acceptedCount >= FLAG_THRESHOLD) {
  //       await this.disableLink(
  //         report.guideId.toString(),
  //         report.linkItemId.toString(),
  //         report.linkType,
  //       );
  //     }
  //   }

  //   return report;
  // }

  // ///
  // /// ----------------------------- INTERNAL SERVICE-TO-SERVICE METHODS -----------------------------
  // ///

  // async getGuideForPurchase(guideId: string) {
  //   const guide = await this.guideModel
  //     .findOne(
  //       {
  //         _id: guideId,
  //       },
  //       {
  //         _id: 1,
  //         price: 1,
  //         visibility: 1,
  //         mainCreator: 1,
  //         currency: 1,
  //         title: 1,
  //         slug: 1,
  //         status: 1,
  //         media: {
  //           thumbnailId: 1,
  //           guideFile: 1,
  //         },
  //       },
  //     )
  //     .lean<PurchaseGuideResponse>()
  //     .exec();

  //   if (!guide)
  //     throw new NotFoundException(`Guide with ID ${guideId} not found`);
  //   return guide;
  // }

  // async incrementPurchaseCount(id: string): Promise<void> {
  //   await this.guideModel.findByIdAndUpdate(id, {
  //     $inc: { purchaseCount: 1 },
  //   });
  // }

  // ///
  // /// ----------------------------- MODERATION METHODS -----------------------------
  // ///

  // private randomBetween(min: number, max: number): number {
  //   return Math.random() * (max - min) + min;
  // }

  // private generateRandomTimestamps(
  //   duration: number,
  //   ranges: [number, number][],
  // ): number[] {
  //   return ranges.map(([min, max]) => {
  //     const base = (duration * this.randomBetween(min, max)) / 100;
  //     const jitter = this.randomBetween(-2, 2);
  //     return Math.max(0, Math.floor(base + jitter));
  //   });
  // }
}
