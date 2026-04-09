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
import {
  ACCESS_LEVEL,
  DIFFICULTY,
  PROJECT_STATUS,
  ProjectInterface,
  ProjectResponse,
} from "./types/projects";
import { slugify } from "./utils/slug";
import { PurchaseInterface } from "./types/purchase";
import { convertSolToLamports } from "./utils/pricing";
import { Project, ProjectDocument } from "./schemas/project.schema";
import {
  ProjectReport,
  ProjectReportDocument,
} from "./schemas/project-report.schema";
import { CreateProjectDto } from "./dto/create-project.dto";
import { PublicUserDto, UsersService } from "src/users/users.service";
import { AccountStatus, RoleName } from "src/auth/auth.types";
import {
  FileMedia,
  FileMediaDocument,
} from "src/file/schemas/file-media.schema";
import { FILE_PROVIDER, FILE_PURPOSE, FILE_STATUS } from "src/file/types/types";
import {
  ImageMedia,
  ImageMediaDocument,
} from "src/image/schemas/image-media.schema";
import {
  IMAGE_PROVIDER,
  IMAGE_PURPOSE,
  IMAGE_STATUS,
} from "src/image/types/types";
import {
  VideoMedia,
  VideoMediaDocument,
} from "src/video/schemas/video-media.schema";
import {
  VIDEO_PROVIDER,
  VIDEO_PURPOSE,
  VIDEO_STATUS,
} from "src/video/types/types";
import { RoleType } from "src/common/types";
import { CategoryService } from "src/category/category.service";
import { PurchasesService } from "src/purchases/purchases.service";
import { MediaService } from "src/media/media.service";
import { UpdateProjectDto } from "./dto/update-project.dto";

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
    @InjectModel(FileMedia.name)
    private fileMediaModel: Model<FileMediaDocument>,
    @InjectModel(ImageMedia.name)
    private imageMediaModel: Model<ImageMediaDocument>,
    @InjectModel(VideoMedia.name)
    private videoMediaModel: Model<VideoMediaDocument>,
    private configService: ConfigService,
    private httpService: HttpService,
    private userService: UsersService,
    private categoryService: CategoryService,
    private purchasesService: PurchasesService,
    private mediaService: MediaService,
  ) {}

  private async checkIfProjectPurchased(
    projectId: string,
  ): Promise<{ purchased: boolean }> {
    const response =
      await this.purchasesService.checkIfProjectPurchased(projectId);

    if (!response.purchased) return { purchased: false };

    return { purchased: true };
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
    const result = await this.mediaService.generateTokenForStreamVideos(
      videoUid,
      expiration,
    );
    if (!result) return { hasAccess: false, videoToken: "" };

    return { hasAccess: true, videoToken: result };
  }

  private async fetchSignedPdfUrl(
    pdfKey: string,
    expiration?: number,
  ): Promise<{
    hasAccess: boolean;
    signedPdfUrl: string;
  }> {
    const result = await this.mediaService.generateSignedUrl(
      pdfKey,
      expiration,
    );
    if (!result) return { hasAccess: false, signedPdfUrl: "" };

    return { hasAccess: true, signedPdfUrl: result };
  }

  private async fetchPurchaseAccess(
    userId: string,
    projectId: string,
    walletAddress?: string,
  ): Promise<{
    hasAccess: boolean;
    isRefundable: boolean;
    purchase?: any;
  }> {
    const result = await this.purchasesService.getPurchaseAccessInternal(
      userId,
      projectId,
      walletAddress,
    );

    if (!result.hasAccess) return { hasAccess: false, isRefundable: false };

    return {
      hasAccess: result.hasAccess,
      isRefundable: result.isRefundable || false,
      purchase: result.purchase,
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
    const category =
      await this.categoryService.getCategoryByIdInternal(categoryId);
    if (!category) return null;
    return {
      _id: category._id?.toString() || categoryId,
      name: category.name,
      slug: category.slug,
    };
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

  private async fetchUserData(userId: string): Promise<PublicUserDto | null> {
    const user = await this.userService.getUserById(userId);

    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    return user;
  }

  private async persistProjectFileMedia(
    userObjectId: Types.ObjectId,
    projectObjectId: Types.ObjectId,
    fileKey?: string,
  ): Promise<void> {
    if (!fileKey?.trim()) return;

    await this.fileMediaModel
      .updateOne(
        { userId: userObjectId, providerUid: fileKey },
        {
          $set: {
            status: FILE_STATUS.PUBLISHED,
            projectId: projectObjectId,
          },
          $setOnInsert: {
            userId: userObjectId,
            providerUid: fileKey,
            provider: FILE_PROVIDER.CLOUDFLARE_R2,
            purpose: FILE_PURPOSE.PROJECT_PDF,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private async persistProjectImageMedia(
    userObjectId: Types.ObjectId,
    projectObjectId: Types.ObjectId,
    imageUids: string[],
  ): Promise<void> {
    if (!imageUids.length) return;

    await Promise.all(
      imageUids.map((providerUid) =>
        this.imageMediaModel
          .updateOne(
            { userId: userObjectId, providerUid },
            {
              $set: {
                status: IMAGE_STATUS.PUBLISHED,
                projectId: projectObjectId,
              },
              $setOnInsert: {
                userId: userObjectId,
                providerUid,
                provider: IMAGE_PROVIDER.CLOUDFLARE_R2,
                purpose: IMAGE_PURPOSE.PROJECT_IMAGE,
              },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );
  }

  private async persistProjectVideoMedia(
    userObjectId: Types.ObjectId,
    projectObjectId: Types.ObjectId,
    input: { mainVideoUid: string; previewVideoUid?: string },
  ): Promise<void> {
    const videoRecords: Array<{ providerUid: string; purpose: VIDEO_PURPOSE }> =
      [
        {
          providerUid: input.mainVideoUid,
          purpose: VIDEO_PURPOSE.PROJECT_MAIN_VIDEO,
        },
      ];

    if (input.previewVideoUid?.trim()) {
      videoRecords.push({
        providerUid: input.previewVideoUid,
        purpose: VIDEO_PURPOSE.PROJECT_PREVIEW_VIDEO,
      });
    }

    await Promise.all(
      videoRecords.map(({ providerUid, purpose }) =>
        this.videoMediaModel
          .updateOne(
            { userId: userObjectId, providerUid },
            {
              $set: {
                status: VIDEO_STATUS.PUBLISHED,
                projectId: projectObjectId,
              },
              $setOnInsert: {
                userId: userObjectId,
                providerUid,
                provider: VIDEO_PROVIDER.CLOUDFLARE_STREAM,
                purpose,
              },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );
  }

  private async persistProjectMediaReferences(
    userId: string,
    projectId: Types.ObjectId,
    dto: CreateProjectDto,
  ): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    const imageUids = (dto.media.images || []).filter((uid) => uid?.trim());

    await Promise.all([
      this.persistProjectVideoMedia(userObjectId, projectId, {
        mainVideoUid: dto.media.mainVideo.fileKey,
        previewVideoUid: dto.media.previewVideo?.fileKey,
      }),
      this.persistProjectFileMedia(
        userObjectId,
        projectId,
        dto.media.projectFile?.fileKey,
      ),
      this.persistProjectImageMedia(userObjectId, projectId, imageUids),
    ]);
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

  private validateProject(dto: CreateProjectDto | UpdateProjectDto): void {
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
      (!dto.media.mainVideo || !dto.media.mainVideo.fileKey.trim())
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
    userId: string | null,
    dto: CreateProjectDto,
  ): Promise<ProjectDocument> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.role !== RoleName.CREATOR)
      throw new ForbiddenException(
        "You are not authorized to create a project",
      );

    if (
      user.walletVerified !== true ||
      user.walletAddress === null ||
      user.walletAddress === undefined
    )
      throw new ForbiddenException(
        "You are not authorized to create a project because you are not verified as a creator or you do not have a wallet.",
      );

    if (!ALLOWED_PRICES.includes(dto.price))
      throw new BadRequestException(
        "Invalid price tier. Please select a valid price tier.",
      );

    this.validateProject(dto);

    const sanitizedDescription = sanitizeHtml(dto.description);

    const slug = await this.generateUniqueSlug(dto.title);

    const media = {
      previewVideo: dto.media.previewVideo.fileKey
        ? dto.media.previewVideo
        : null,
      mainVideo: dto.media.mainVideo.fileKey ? dto.media.mainVideo : null,
      images: dto.media.images || [],
      projectFile: dto.media.projectFile?.fileKey
        ? dto.media.projectFile
        : null,
      thumbnailId: dto.media.thumbnailId || null,
    };

    const creatorObjectId = new Types.ObjectId(userId);
    const project = new this.projectModel({
      ...dto,
      status: PROJECT_STATUS.DRAFT,
      description: sanitizedDescription,
      category: new Types.ObjectId(dto.category),
      subcategory: dto.subcategory ? new Types.ObjectId(dto.subcategory) : null,
      price: convertSolToLamports(dto.price),
      media,
      creatorId: creatorObjectId,
      creatorWallet: user.walletAddress,
      slug,
      publishedAt: null,
      lastEditedAt: new Date(),
    });

    const savedProject = await project.save();
    await this.persistProjectMediaReferences(userId, savedProject._id, dto);

    return savedProject;
  }

  async getProjectForEditing(
    slug: string,
    user: { id: string | null; role?: string | null } | null,
  ): Promise<ProjectInterface> {
    if (!user?.id) throw new NotFoundException(`User ID is required`);
    if (user && user.role !== RoleType.CREATOR)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        title: "Unauthorized",
        message: "You are not authorized to edit this project",
      });

    const project: any = await this.projectModel
      .findOne({ slug, creatorId: new Types.ObjectId(user?.id) })
      .lean()
      .exec();

    if (!project)
      throw new NotFoundException(`Project with slug ${slug} not found.`);

    const isOwner = user !== null && project.creatorId?.toString() === user.id;

    if (!isOwner)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You do not have access to this project.",
      });

    return project;
  }

  async publishProject(
    id: string,
    userId: string | null,
  ): Promise<{ success: boolean; status?: PROJECT_STATUS; error?: string }> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.role !== RoleName.CREATOR)
      return { success: false, error: "You are not a creator." };

    if (
      user.walletVerified !== true ||
      user.walletAddress === null ||
      user.walletAddress === undefined
    )
      return {
        success: false,
        error:
          "You are not authorized to publish a project because you are not verified as a creator or you do not have a wallet.",
      };

    const existingProject = await this.projectModel
      .findOne({ _id: id, creatorId: new Types.ObjectId(userId) })
      .exec();

    if (!existingProject)
      return {
        success: false,
        error: "Project not found or you are not the owner",
      };

    const updatedProject = await this.projectModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: PROJECT_STATUS.PUBLISHED,
          publishedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedProject?.status as PROJECT_STATUS };
  }

  async unpublishProject(
    id: string,
    userId: string | null,
  ): Promise<{ success: boolean; status?: PROJECT_STATUS; error?: string }> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const isPurchased = await this.checkIfProjectPurchased(id);
    if (isPurchased.purchased)
      return {
        success: false,
        error: `Project has been purchased and cannot be unpublished`,
      };

    const existingProject = await this.projectModel
      .findOne({ _id: id, creatorId: new Types.ObjectId(userId) })
      .exec();

    if (!existingProject)
      return {
        success: false,
        error: `Project not found or you are not the owner`,
      };

    if (existingProject.purchaseCount && existingProject.purchaseCount > 0)
      return {
        success: false,
        error: `Project has been purchased and cannot be unpublished`,
      };

    const updatedProject = await this.projectModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: PROJECT_STATUS.DRAFT,
          unpublishedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedProject?.status as PROJECT_STATUS };
  }

  async deleteProject(
    id: string,
    userId: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const isPurchased = await this.checkIfProjectPurchased(id);
    if (isPurchased.purchased)
      return {
        success: false,
        error: `Project has been purchased and cannot be deleted`,
      };

    const existingProject = await this.projectModel
      .findOne({ _id: id, creatorId: new Types.ObjectId(userId) })
      .exec();

    if (!existingProject)
      return {
        success: false,
        error: `Project not found or you are not the owner`,
      };

    if (existingProject.purchaseCount && existingProject.purchaseCount > 0)
      return {
        success: false,
        error: `Project has been purchased and cannot be deleted`,
      };

    const result = await this.projectModel.deleteOne({ _id: id });

    return {
      success: result.deletedCount === 1,
    };
  }

  async getProjectsByCreator(
    creatorId: string,
    userId: string | null,
  ): Promise<ProjectDocument[] | null> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const user = await this.fetchUserData(userId);

    if (user?.role !== RoleName.CREATOR)
      throw new ForbiddenException("You are not authorized to access projects");

    if (creatorId !== userId)
      throw new ForbiddenException(
        "You are not authorized to access projects created by other creators",
      );

    const projects = await this.projectModel
      .find({ creatorId: new Types.ObjectId(creatorId) })
      .sort({ createdAt: -1 })
      .exec();

    if (projects.length === 0) return null;
    return projects;
  }

  async getProjectBySlug(
    slug: string,
    user: {
      id: string | null;
      role?: string | null;
      walletAddress?: string | null;
    } | null,
  ): Promise<ProjectResponse> {
    const project: any = await this.projectModel
      .findOne({ slug })
      .lean()
      .exec();

    if (!project)
      throw new NotFoundException(`Project with slug ${slug} not found.`);

    if (project.category) {
      const categoryData = await this.fetchCategoryById(
        project.category.toString(),
      );
      if (categoryData) project.category = categoryData;
    }

    if (project.subcategory) {
      const subcategoryData = await this.fetchSubcategoryById(
        project.subcategory.toString(),
      );
      if (subcategoryData) project.subcategory = subcategoryData;
    }

    const isOwner = user !== null && project.creatorId?.toString() === user.id;

    let hasAccess = false;
    let isRefundable = false;

    if (user?.id && !isOwner) {
      const purchaseAccess = await this.fetchPurchaseAccess(
        user.id,
        project._id,
        user.walletAddress || undefined,
      );

      hasAccess = purchaseAccess.hasAccess;
      isRefundable = purchaseAccess.isRefundable;
    }

    // Access level
    let accessLevel = ACCESS_LEVEL.PREVIEW;

    if (isOwner) accessLevel = ACCESS_LEVEL.OWNER;
    if (hasAccess) accessLevel = ACCESS_LEVEL.FULL;

    const fullAccess =
      accessLevel === ACCESS_LEVEL.FULL || accessLevel === ACCESS_LEVEL.OWNER;

    let playbackUrl: string | undefined;
    let requiresToken = false;

    if (
      project.status !== PROJECT_STATUS.PUBLISHED &&
      !isOwner &&
      !hasAccess &&
      !fullAccess
    )
      throw new ForbiddenException("This project is not published.");

    if (
      accessLevel === ACCESS_LEVEL.PREVIEW &&
      project.media?.previewVideo?.fileKey
    ) {
      playbackUrl = `https://videodelivery.net/${project.media.previewVideo.fileKey}/manifest/video.m3u8`;
    }

    if (fullAccess && project.media?.mainVideo?.fileKey) {
      playbackUrl = `https://videodelivery.net/${project.media.mainVideo.fileKey}/manifest/video.m3u8`;
      requiresToken = true;
    }

    const responseProject: Partial<ProjectInterface> = {
      _id: project._id,
      title: project.title,
      description: project.description,
      difficulty: project.difficulty,
      estimatedDurationMinutes: project.estimatedDurationMinutes,
      contentLanguage: project.contentLanguage,
      price: project.price,
      status: project.status,
      literature: fullAccess ? project.literature : [],
      category: project.category,
      subcategory: project.subcategory,
      creatorId: project.creatorId,
      creatorWallet: project.creatorWallet,
      projectType: project.projectType,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      slug: project.slug,
      purchaseCount: project.purchaseCount,
      media: {
        thumbnailId: project.media?.thumbnailId,
        images: project.media?.images,
        projectFile: project.media?.projectFile,
        ...(playbackUrl && {
          video: {
            playbackUrl,
            requiresToken,
          },
        }),
      },
    };

    let signedAssets: ProjectResponse["signedAssets"] | undefined;
    if (requiresToken) {
      const accessToken = await this.fetchAccessTokenForMedia(
        project.media?.mainVideo?.fileKey,
      );
      signedAssets = {
        videoToken: accessToken.videoToken,
      };
    }

    let isPurchasable = true;
    if (project.status !== PROJECT_STATUS.PUBLISHED) isPurchasable = false;

    const creator = await this.fetchUserData(project.creatorId.toString());

    if (creator?.accountStatus !== AccountStatus.ACTIVE) isPurchasable = false;

    return {
      project: responseProject,
      access: {
        level: accessLevel,
        isOwner,
        canWatch: fullAccess,
        canDownloadPdf: fullAccess,
        isPurchasable,
        isRefundable,
      },
      ...(signedAssets ? { signedAssets } : {}),
    };
  }

  async updateProject(
    id: string,
    userId: string | null,
    dto: UpdateProjectDto,
  ): Promise<ProjectDocument> {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const isPurchased = await this.checkIfProjectPurchased(id);
    if (isPurchased.purchased)
      throw new BadRequestException(
        `Project has been purchased and cannot be updated`,
      );

    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.role !== RoleName.CREATOR)
      throw new ForbiddenException(
        "You are not authorized to update a project",
      );

    if (
      user.walletVerified !== true ||
      user.walletAddress === null ||
      user.walletAddress === undefined
    )
      throw new ForbiddenException(
        "You are not authorized to update a project because you are not verified as a creator or you do not have a wallet.",
      );

    const project = await this.projectModel.findById(id).exec();

    if (!project)
      throw new NotFoundException(`Project with ID ${id} not found`);

    this.validateProject(dto);

    const update: Record<string, any> = {};

    if (dto.title !== undefined) {
      update.title = dto.title;
      update.slug = await this.generateUniqueSlug(dto.title);
    }
    if (dto.description !== undefined)
      update.description = sanitizeHtml(dto.description);
    if (dto.category !== undefined) {
      const categoryValue = String(dto.category).trim();
      if (!Types.ObjectId.isValid(categoryValue))
        throw new BadRequestException("Invalid category id");
      update.category = new Types.ObjectId(categoryValue);
    }
    if (dto.subcategory !== undefined) {
      const subcategoryValue = String(dto.subcategory ?? "").trim();
      if (dto.subcategory === null) {
        update.subcategory = null;
      } else if (subcategoryValue !== "") {
        if (!Types.ObjectId.isValid(subcategoryValue))
          throw new BadRequestException("Invalid subcategory id");
        update.subcategory = new Types.ObjectId(subcategoryValue);
      }
    }
    if (dto.contentLanguage !== undefined)
      update.contentLanguage = dto.contentLanguage;
    if (dto.price !== undefined) update.price = convertSolToLamports(dto.price);

    if (dto.media?.previewVideo?.fileKey !== undefined)
      update["media.previewVideo"] = dto.media.previewVideo;
    if (dto.media?.mainVideo?.fileKey !== undefined)
      update["media.mainVideo"] = dto.media.mainVideo;
    if (dto.media?.projectFile?.fileKey !== undefined)
      update["media.projectFile"] = dto.media.projectFile;
    if (dto.media?.thumbnailId !== undefined)
      update["media.thumbnailId"] = dto.media.thumbnailId;
    if (dto.media?.images !== undefined)
      update["media.images"] = dto.media.images;
    if (dto.literature !== undefined) update["literature"] = dto.literature;
    if (dto.estimatedDurationMinutes !== undefined)
      update.estimatedDurationMinutes = dto.estimatedDurationMinutes;

    const updatedProject = await this.projectModel.findByIdAndUpdate(
      id,
      { $set: { ...update, lastEditedAt: new Date() } },
      { new: true, runValidators: true },
    );

    return updatedProject as unknown as ProjectDocument;
  }

  async accessProjectPdf(userId: string | null, projectId: string) {
    if (!userId) throw new NotFoundException(`User ID is required`);
    const purchase = await this.fetchPurchaseAccess(userId, projectId);

    const project = await this.projectModel.findById(projectId).lean();
    if (!project?.media?.projectFile?.fileKey)
      throw new BadRequestException("PDF not found");

    if (userId.toString() === project.creatorId.toString()) {
      const signedUrl = await this.fetchSignedPdfUrl(
        project.media.projectFile.fileKey,
      );
      if (!signedUrl.hasAccess)
        throw new BadRequestException("Failed to generate signed PDF URL");

      return {
        success: true,
        url: signedUrl,
      };
    }

    if (!purchase) throw new ForbiddenException("Project not purchased");

    if (!purchase.purchase?.pdfAvailable) {
      throw new BadRequestException("Project has no PDF");
    }

    if (!purchase.purchase?.pdfAccessed)
      await this.updatePurchaseAccess(purchase.purchase._id.toString());

    const signedUrl = await this.fetchSignedPdfUrl(
      project.media.projectFile.fileKey,
    );

    if (!signedUrl.hasAccess)
      throw new BadRequestException("Failed to generate signed PDF URL");

    return {
      success: true,
      url: signedUrl,
    };
  }

  async findPublicExploreProjects({
    page,
    limit,
    sortBy,
    sortOrder,
    categoryId,
    subcategoryId,
    search,
    difficulty,
    price,
    duration,
  }: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    categoryId?: string;
    subcategoryId?: string;
    search?: string;
    difficulty?: DIFFICULTY;
    price?: string;
    duration?: string;
  }) {
    const query: any = {
      status: PROJECT_STATUS.PUBLISHED,
    };

    if (categoryId) query.category = new Types.ObjectId(categoryId);

    if (subcategoryId) query.subcategories = new Types.ObjectId(subcategoryId);

    if (difficulty) query.difficulty = difficulty;

    if (search)
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];

    if (price) {
      if (price.startsWith("lt-")) {
        query.price = { $lt: Number(price.replace("lt-", "")) };
      } else if (price.startsWith("gt-")) {
        query.price = { $gt: Number(price.replace("gt-", "")) };
      } else if (price.startsWith("btw-")) {
        const [min, max] = price.replace("btw-", "").split("-").map(Number);
        query.price = { $gte: min, $lte: max };
      }
    }

    if (duration) {
      if (duration.startsWith("lt-")) {
        query.estimatedDurationMinutes = {
          $lt: Number(duration.replace("lt-", "")),
        };
      } else if (duration.startsWith("gt-")) {
        query.estimatedDurationMinutes = {
          $gt: Number(duration.replace("gt-", "")),
        };
      } else if (duration.startsWith("btw-")) {
        const [min, max] = duration.replace("btw-", "").split("-").map(Number);
        query.estimatedDurationMinutes = { $gte: min, $lte: max };
      }
    }

    const sort: any = {};
    switch (sortBy) {
      case "price":
        sort.price = sortOrder === "asc" ? 1 : -1;
        break;
      case "purchaseCount":
        sort.purchaseCount = sortOrder === "asc" ? 1 : -1;
        break;
      default:
        sort.createdAt = sortOrder === "asc" ? 1 : -1;
    }

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      this.projectModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
      this.projectModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: projects,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // async reportProject(
  //   projectId: string,
  //   dto: ReportProjectDto,
  //   userId: string,
  // ): Promise<boolean> {
  //   const project = await this.projectModel.findById(projectId).exec();
  //   if (!project)
  //     throw new NotFoundException(`Project with ID ${projectId} not found`);

  //   if (project.creatorId?.toString() === userId)
  //     throw new ForbiddenException("You cannot report your own project.");

  //   const report = new this.projectReportModel({
  //     projectId: new Types.ObjectId(projectId),
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
  //   projectId: string,
  //   dto: ReportLinkDto,
  //   userId: string,
  // ): Promise<boolean> {
  //   const project = await this.projectModel.findById(projectId).exec();
  //   if (!project)
  //     throw new NotFoundException(`Project with ID ${projectId} not found`);

  //   if (project.creatorId?.toString() === userId)
  //     throw new ForbiddenException("You cannot report your own project.");

  //   const report = new this.linkReportModel({
  //     projectId: new Types.ObjectId(projectId),
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

  // getAllProjects(categoryId?: string): Promise<ProjectDocument[]> {
  //   const query: any = {};
  //   if (categoryId) {
  //     query.category = new Types.ObjectId(categoryId);
  //   }
  //   return this.projectModel.find(query).sort({ createdAt: -1 }).exec();
  // }

  // getPublicProjectsByCreator(creatorId: string): Promise<ProjectDocument[]> {
  //   return this.projectModel
  //     .find({
  //       creatorId: new Types.ObjectId(creatorId),
  //       visibility: VISIBILITY_TYPE.PUBLIC,
  //       status: PROJECT_STATUS.PUBLISHED,
  //     })
  //     .sort({ createdAt: -1 })
  //     .exec();
  // }

  // ///
  // /// ----------------------------- ADMIN FACING METHODS -----------------------------
  // ///

  // async findAdminProjects({
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
  //   status?: PROJECT_STATUS;
  //   search?: string;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;

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

  //   const [projects, total] = await Promise.all([
  //     this.projectModel.aggregate([
  //       { $match: query },

  //       {
  //         $lookup: {
  //           from: "project_reports",
  //           let: { projectId: "$_id" },
  //           pipeline: [
  //             {
  //               $match: {
  //                 $expr: { $eq: ["$projectId", "$$projectId"] },
  //                 status: ProjectReportStatus.ACCEPTED,
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
  //           from: "project_link_reports",
  //           let: { projectId: "$_id" },
  //           pipeline: [
  //             {
  //               $match: {
  //                 $expr: { $eq: ["$projectId", "$$projectId"] },
  //                 status: ProjectLinkReportStatus.ACCEPTED,
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

  // async findAdminProjectReports({
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
  //   status?: ProjectReportStatus;
  //   reason?: ProjectReportReason;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;
  //   if (reason) query["reason"] = reason;

  //   const sort: any = {};
  //   sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
  //     sortOrder === "asc" ? -1 : 1;

  //   const skip = (page - 1) * limit;

  //   const [reports, total] = await Promise.all([
  //     this.projectReportModel
  //       .find(query)
  //       .sort(sort)
  //       .skip(skip)
  //       .populate("projectId", "title description slug")
  //       .limit(limit)
  //       .lean(),
  //     this.projectReportModel.countDocuments(query),
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

  // async findAdminProjectLinkReports({
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
  //   status?: ProjectLinkReportStatus;
  //   reason?: ProjectLinkReportReason;
  // }) {
  //   const query: any = {};

  //   if (status) query["status"] = status;
  //   if (reason) query["reason"] = reason;

  //   const sort: any = {};
  //   sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
  //     sortOrder === "asc" ? -1 : 1;

  //   const skip = (page - 1) * limit;

  //   const [reports, total] = await Promise.all([
  //     this.projectLinkReportModel
  //       .find(query)
  //       .sort(sort)
  //       .skip(skip)
  //       .populate("projectId", "title description slug")
  //       .limit(limit)
  //       .lean(),
  //     this.projectLinkReportModel.countDocuments(query),
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

  // async updateProjectStatus(projectId: string, status: PROJECT_STATUS) {
  //   const project = await this.projectModel
  //     .findByIdAndUpdate(projectId, { status }, { new: true })
  //     .exec();

  //   if (!project) throw new NotFoundException(`Project not found`);

  //   return project;
  // }

  // async takeProjectReportAction(
  //   reportId: string,
  //   status: ProjectReportStatus,
  // ): Promise<ProjectReportDocument> {
  //   const report = await this.projectReportModel.findByIdAndUpdate(
  //     reportId,
  //     {
  //       status,
  //     },
  //     { new: true },
  //   );

  //   if (!report) throw new NotFoundException("Project report not found");
  //   return report;
  // }

  // async disableLink(
  //   projectId: string,
  //   linkItemId: string,
  //   linkType: ProjectLinkType,
  // ) {
  //   const field = linkType === ProjectLinkType.TOOL ? "tools" : "materials";

  //   await this.projectModel.updateOne(
  //     { _id: projectId },
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

  // async takeProjectLinkReportAction(
  //   reportId: string,
  //   status: ProjectLinkReportStatus,
  // ): Promise<ProjectLinkReportDocument> {
  //   const report = await this.projectLinkReportModel.findById(reportId);

  //   if (!report) throw new NotFoundException("Project link report not found");

  //   if (report.status === status) return report;

  //   report.status = status;
  //   await report.save();

  //   if (status === ProjectLinkReportStatus.ACCEPTED) {
  //     const FLAG_THRESHOLD = 5;

  //     const acceptedCount = await this.projectLinkReportModel.countDocuments({
  //       projectId: report.projectId,
  //       linkItemId: report.linkItemId,
  //       status: ProjectLinkReportStatus.ACCEPTED,
  //     });

  //     if (acceptedCount >= FLAG_THRESHOLD) {
  //       await this.disableLink(
  //         report.projectId.toString(),
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

  // async getProjectForPurchase(projectId: string) {
  //   const project = await this.projectModel
  //     .findOne(
  //       {
  //         _id: projectId,
  //       },
  //       {
  //         _id: 1,
  //         price: 1,
  //         status: 1,
  //         creatorId: 1,
  //         currency: 1,
  //         title: 1,
  //         slug: 1,
  //         status: 1,
  //         media: {
  //           thumbnailId: 1,
  //           projectFile: 1,
  //         },
  //       },
  //     )
  //     .lean<PurchaseProjectResponse>()
  //     .exec();

  //   if (!project)
  //     throw new NotFoundException(`Project with ID ${projectId} not found`);
  //   return project;
  // }

  // async incrementPurchaseCount(id: string): Promise<void> {
  //   await this.projectModel.findByIdAndUpdate(id, {
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
