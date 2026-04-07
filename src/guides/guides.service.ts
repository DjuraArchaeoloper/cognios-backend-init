import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, PipelineStage, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Guide, GuideDocument } from "./schemas/guide.schema";
import { LinkReport, LinkReportDocument } from "./schemas/link-report.schema";
import {
  GuideReport,
  GuideReportDocument,
} from "./schemas/guide-report.schema";
import { CreateGuideDto } from "./dto/create-guide.dto";
import { UpdateGuideDto } from "./dto/update-guide.dto";
import { ReportLinkDto } from "./dto/report-link.dto";
import { ReportGuideDto } from "./dto/report-guide.dto";
import { sanitizeHtml } from "./utils/sanitization";
import {
  ACCESS_LEVEL,
  DIFFICULTY,
  GUIDE_STATUS,
  GuideInterface,
  GuideLinkReportReason,
  GuideLinkReportStatus,
  GuideLinkType,
  GuideReportReason,
  GuideReportStatus,
  GuideResponse,
  MetadataGuideResponse,
  PublicGuideResponse,
  PurchaseGuideResponse,
  VIDEO_ASSET_SOURCE,
  VISIBILITY_TYPE,
} from "./types/guides";
import { slugify } from "./utils/slug";
import { RoleType } from "src/common/types";
import { SavedGuide, SavedGuideDocument } from "./schemas/saved-guide.schema";
import { PurchaseInterface } from "./types/purchase";
import { AccountStatus } from "./types/user";
import { VisualModerationTarget } from "./types/moderation";
import { convertSolToLamports } from "./utils/pricing";

const ALLOWED_PRICES = [7, 12, 19, 29, 49];
const SIGHTENGINE_TIMEOUT_MS = 5000;

@Injectable()
export class GuidesService {
  private readonly authServiceUrl: string;
  private readonly categoryServiceUrl: string;
  private readonly billingServiceUrl: string;
  private readonly fileServiceUrl: string;

  private readonly accountId: string | undefined;

  constructor(
    @InjectModel(Guide.name)
    private guideModel: Model<GuideDocument>,
    @InjectModel(LinkReport.name)
    private linkReportModel: Model<LinkReportDocument>,
    @InjectModel(GuideReport.name)
    private guideReportModel: Model<GuideReportDocument>,
    @InjectModel(SavedGuide.name)
    private savedGuideModel: Model<SavedGuideDocument>,
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

  private async checkIfGuidePurchased(
    guideId: string,
  ): Promise<{ purchased: boolean }> {
    if (!this.billingServiceUrl)
      throw new Error("BILLING_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.billingServiceUrl}/billing/purchases/check-if-guide-purchased/${guideId}`,
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
    guideId: string,
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
        `${this.billingServiceUrl}/billing/purchases/access/internal?userId=${userId}&guideId=${guideId}`,
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
    const baseSlug = slugify(title) || `guide-${Date.now()}`;

    let slug = baseSlug;
    let counter = 1;

    while (await this.guideModel.exists({ slug })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  private validateGuide(dto: UpdateGuideDto): void {
    // Validate that required fields are not being set to empty values
    const errors: string[] = [];

    if (dto.difficulty !== undefined && !dto.difficulty)
      errors.push("Difficulty is required");

    if (dto.title !== undefined && (!dto.title || !dto.title.trim()))
      errors.push("Title is required");

    if (
      dto.description !== undefined &&
      (!dto.description || !dto.description.trim())
    )
      errors.push("Description is required");

    if (dto.category !== undefined && !dto.category)
      errors.push("Category is required");

    if (dto.visibility !== undefined && !dto.visibility)
      errors.push("Visibility is required");

    if (
      dto.contentLanguage !== undefined &&
      (!dto.contentLanguage || !dto.contentLanguage.trim())
    )
      errors.push("Content language is required");

    if (dto.monetizationType !== undefined && !dto.monetizationType)
      errors.push("Monetization type is required");

    if (dto.price !== undefined && (dto.price === null || dto.price < 0))
      errors.push("Price is required and must be 0 or greater");

    if (
      dto.media?.mainVideo?.streamId !== undefined &&
      (!dto.media.mainVideo?.streamId || !dto.media.mainVideo?.streamId.trim())
    )
      errors.push("Main guide video (content URL) is required");

    if (
      dto.tools !== undefined &&
      (!Array.isArray(dto.tools) || dto.tools.length === 0)
    )
      errors.push("At least one tool is required");

    if (dto.tools !== undefined) {
      const invalidTools = dto.tools.filter(
        (tool) => !tool || !tool.name || !tool.name.trim(),
      );
      if (invalidTools.length > 0) {
        errors.push("All tools must have a name");
      }
    }
    if (
      dto.materials !== undefined &&
      (!Array.isArray(dto.materials) || dto.materials.length === 0)
    ) {
      errors.push("At least one material is required");
    } else if (dto.materials !== undefined) {
      const invalidMaterials = dto.materials.filter(
        (material) => !material || !material.name || !material.name.trim(),
      );
      if (invalidMaterials.length > 0) {
        errors.push("All materials must have a name");
      }
    }

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

  async getGuideMetadataBySlug(slug: string): Promise<MetadataGuideResponse> {
    const guide = await this.guideModel
      .findOne(
        {
          slug,
          status: GUIDE_STATUS.PUBLISHED,
        },
        {
          _id: 1,
          title: 1,
          description: 1,
          category: 1,
          slug: 1,
          media: {
            thumbnailId: 1,
            images: 1,
          },
          visibility: 1,
          estimatedDurationMinutes: 1,
          mainCreatorSnapshot: 1,
          contentLanguage: 1,
          safetyNotes: 1,
          price: 1,
          currency: 1,
          createdAt: 1,
        },
      )
      .lean<MetadataGuideResponse>()
      .exec();

    if (guide && guide.category) {
      const categoryData = await this.fetchCategoryById(
        guide.category.toString(),
      );
      if (categoryData) guide.category = categoryData;
    }

    if (!guide)
      throw new NotFoundException(`Guide with slug ${slug} not found`);
    return guide;
  }

  async getPublicGuidesForSitemap(): Promise<
    { slug: string; createdAt: Date; updatedAt: Date }[]
  > {
    const guides = await this.guideModel
      .find(
        {
          status: GUIDE_STATUS.PUBLISHED,
        },
        {
          slug: 1,
          createdAt: 1,
          updatedAt: 1,
          _id: 0,
        },
      )
      .lean<{ slug: string; createdAt: Date; updatedAt: Date }[]>() // 👈 ARRAY
      .sort({ createdAt: -1 })
      .exec();

    return guides;
  }

  async createGuide(
    userId: string,
    dto: CreateGuideDto,
  ): Promise<GuideDocument> {
    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
      throw new ForbiddenException("You are not authorized to create a guide");

    if (
      user.financialInfo?.stripeVerified !== true ||
      user.financialInfo?.stripeAccountId === null ||
      user.financialInfo?.stripeAccountId === undefined
    )
      throw new ForbiddenException(
        "You are not authorized to create a guide because you are not verified as a creator or you do not have a stripe account.",
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
      guideFile: dto.media.guideFile || null,
      thumbnailId: dto.media.thumbnailId || null,
    };

    await this.runModerationCheck(dto);

    const guide = new this.guideModel({
      ...dto,
      status: GUIDE_STATUS.DRAFT,
      description: sanitizedDescription,
      category: new Types.ObjectId(dto.category),
      subcategories:
        dto.subcategories?.map((id) => new Types.ObjectId(id)) || [],
      price: convertSolToLamports(dto.price),
      media,
      mainCreator: new Types.ObjectId(dto.mainCreator),
      slug,
      publishedAt: null,
      lastEditedAt: new Date(),
    });

    const savedGuide = await guide.save();

    await this.makeMediaPublished(
      dto.media.mainVideo.streamId,
      userId,
      "video",
    );

    if (dto.media.previewVideo.streamId) {
      await this.makeMediaPublished(
        dto.media.previewVideo.streamId,
        userId,
        "video",
      );
    }

    if (dto.media.guideFile?.fileKey) {
      await this.makeMediaPublished(
        dto.media.guideFile.fileKey,
        userId,
        "file",
      );
    }
    if (dto.media.images && dto.media.images.length > 0) {
      for (const image of dto.media.images) {
        await this.makeMediaPublished(image, userId, "image");
      }
    }

    return savedGuide;
  }

  async updateGuide(
    id: string,
    userId: string,
    dto: UpdateGuideDto,
  ): Promise<GuideDocument> {
    const isPurchased = await this.checkIfGuidePurchased(id);
    if (isPurchased.purchased)
      throw new BadRequestException(
        `Guide has been purchased and cannot be updated`,
      );

    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
      throw new ForbiddenException("You are not authorized to update a guide");

    if (
      user.financialInfo?.stripeVerified !== true ||
      user.financialInfo?.stripeAccountId === null ||
      user.financialInfo?.stripeAccountId === undefined
    )
      throw new ForbiddenException(
        "You are not authorized to update a guide because you are not verified as a creator or you do not have a stripe account.",
      );

    const guide = await this.guideModel.findById(id).exec();

    if (!guide) throw new NotFoundException(`Guide with ID ${id} not found`);

    this.validateGuide(dto);

    const update: Record<string, any> = {};

    if (dto.difficulty !== undefined) update.difficulty = dto.difficulty;
    if (dto.title !== undefined) {
      update.title = dto.title;
      update.slug = await this.generateUniqueSlug(dto.title);
    }
    if (dto.description !== undefined)
      update.description = sanitizeHtml(dto.description);
    if (dto.category !== undefined)
      update.category = new Types.ObjectId(dto.category);
    if (dto.subcategories !== undefined)
      update.subcategories = dto.subcategories.map(
        (id) => new Types.ObjectId(id),
      );
    if (dto.tags !== undefined) update.tags = dto.tags;
    if (dto.visibility !== undefined) update.visibility = dto.visibility;
    if (dto.contentLanguage !== undefined)
      update.contentLanguage = dto.contentLanguage;
    if (dto.monetizationType !== undefined)
      update.monetizationType = dto.monetizationType;
    if (dto.price !== undefined) update.price = convertSolToLamports(dto.price);

    if (dto.media?.previewVideo?.streamId !== undefined)
      update["media.previewVideo"] = dto.media.previewVideo;
    if (dto.media?.mainVideo?.streamId !== undefined)
      update["media.mainVideo"] = dto.media.mainVideo;
    if (dto.media?.guideFile?.fileKey !== undefined)
      update["media.guideFile"] = dto.media.guideFile;
    if (dto.media?.thumbnailId !== undefined)
      update["media.thumbnailId"] = dto.media.thumbnailId;
    if (dto.media?.images !== undefined)
      update["media.images"] = dto.media.images;

    if (dto.tools !== undefined)
      update.tools = dto.tools.map((tool) => ({
        name: tool.name,
        link: tool.link,
      }));

    if (dto.materials !== undefined)
      update.materials = dto.materials.map((material) => ({
        name: material.name,
        link: material.link,
      }));

    if (dto.safetyNotes !== undefined) update.safetyNotes = dto.safetyNotes;
    if (dto.estimatedDurationMinutes !== undefined)
      update.estimatedDurationMinutes = dto.estimatedDurationMinutes;

    await this.runModerationCheckForUpdate(dto);

    const updatedGuide = await this.guideModel.findByIdAndUpdate(
      id,
      { $set: { ...update, lastEditedAt: new Date() } },
      { new: true, runValidators: true },
    );

    return updatedGuide as unknown as GuideDocument;
  }

  async findPublicExploreGuides({
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
      visibility: VISIBILITY_TYPE.PUBLIC,
      status: GUIDE_STATUS.PUBLISHED,
    };

    if (categoryId) query.category = new Types.ObjectId(categoryId);

    if (subcategoryId) query.subcategories = new Types.ObjectId(subcategoryId);

    if (difficulty) query.difficulty = difficulty;

    if (search)
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
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

    const [guides, total] = await Promise.all([
      this.guideModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
      this.guideModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: guides,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getGuideBySlug(
    slug: string,
    user: { id: string; role?: string } | null,
  ): Promise<GuideResponse> {
    const guide: any = await this.guideModel.findOne({ slug }).lean().exec();

    if (!guide)
      throw new NotFoundException(`Guide with slug ${slug} not found.`);

    if (guide.category) {
      const categoryData = await this.fetchCategoryById(
        guide.category.toString(),
      );
      if (categoryData) guide.category = categoryData;
    }

    if (Array.isArray(guide.subcategories) && guide.subcategories.length > 0) {
      const subcategoriesData = (
        await Promise.all(
          guide.subcategories.map((id) =>
            this.fetchSubcategoryById(id.toString()),
          ),
        )
      ).filter(Boolean);
      guide.subcategories = subcategoriesData;
    }

    // Ownership
    const isOwner = user !== null && guide.mainCreator?.toString() === user.id;

    // Purchase access
    let hasAccess = false;
    let isRefundable = false;

    if (user && !isOwner) {
      const purchaseAccess = await this.fetchPurchaseAccess(user.id, guide._id);

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
      guide.status !== GUIDE_STATUS.PUBLISHED &&
      !isOwner &&
      !hasAccess &&
      !fullAccess
    )
      throw new ForbiddenException("This guide is not published.");

    if (
      accessLevel === ACCESS_LEVEL.PREVIEW &&
      guide.media?.previewVideo?.streamId
    ) {
      playbackUrl = `https://videodelivery.net/${guide.media.previewVideo.streamId}/manifest/video.m3u8`;
    }

    if (fullAccess && guide.media?.mainVideo?.streamId) {
      playbackUrl = `https://videodelivery.net/${guide.media.mainVideo?.streamId}/manifest/video.m3u8`;
      requiresToken = true;
    }

    const responseGuide: PublicGuideResponse = {
      _id: guide._id,
      title: guide.title,
      description: guide.description,
      difficulty: guide.difficulty,
      estimatedDurationMinutes: guide.estimatedDurationMinutes,
      contentLanguage: guide.contentLanguage,
      price: guide.price,
      monetizationType: guide.monetizationType,
      visibility: guide.visibility,
      status: guide.status,
      tags: guide.tags,
      tools: fullAccess ? guide.tools : [],
      materials: fullAccess ? guide.materials : [],
      safetyNotes: guide.safetyNotes,
      category: guide.category,
      subcategories: guide.subcategories,
      mainCreator: guide.mainCreator,
      mainCreatorSnapshot: guide.mainCreatorSnapshot,
      guideType: guide.guideType,
      createdAt: guide.createdAt,
      updatedAt: guide.updatedAt,
      slug: guide.slug,
      currency: guide.currency,
      purchaseCount: guide.purchaseCount,
      publishedAt: guide.publishedAt,
      media: {
        thumbnailId: guide.media?.thumbnailId,
        images: guide.media?.images,
        hasPdf: Boolean(guide.media?.guideFile?.fileKey),
        ...(playbackUrl && {
          video: {
            playbackUrl,
            requiresToken,
          },
        }),
      },
    };

    let signedAssets: GuideResponse["signedAssets"] | undefined;

    if (requiresToken) {
      const accessToken = await this.fetchAccessTokenForMedia(
        guide.media?.mainVideo?.streamId,
      );
      signedAssets = {
        videoToken: accessToken.videoToken,
      };
    }

    let isPurchasable = true;
    if (guide.status !== GUIDE_STATUS.PUBLISHED) isPurchasable = false;

    const creator = await this.fetchUserData(guide.mainCreator.toString());

    if (creator?.profileInfo.accountStatus !== AccountStatus.ACTIVE)
      isPurchasable = false;

    return {
      guide: responseGuide,
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

  async accessGuidePdf(userId: string, guideId: string) {
    const purchase = await this.fetchPurchaseAccess(userId, guideId);

    const guide = await this.guideModel.findById(guideId).lean();
    if (!guide?.media?.guideFile?.fileKey)
      throw new BadRequestException("PDF not found");

    if (userId.toString() === guide.mainCreator.toString()) {
      const signedUrl = await this.fetchSignedPdfUrl(
        guide.media.guideFile.fileKey,
      );

      if (!signedUrl.hasAccess)
        throw new BadRequestException("Failed to generate signed PDF URL");

      return {
        success: true,
        url: signedUrl,
      };
    }

    if (!purchase) throw new ForbiddenException("Guide not purchased");

    if (!purchase.purchase?.pdfAvailable) {
      throw new BadRequestException("Guide has no PDF");
    }

    if (!purchase.purchase?.pdfAccessed)
      await this.updatePurchaseAccess(purchase.purchase._id.toString());

    const signedUrl = await this.fetchSignedPdfUrl(
      guide.media.guideFile.fileKey,
    );

    if (!signedUrl.hasAccess)
      throw new BadRequestException("Failed to generate signed PDF URL");

    return {
      success: true,
      url: signedUrl,
    };
  }

  async getGuideForEditing(
    slug: string,
    user: { id: string; role?: string } | null,
  ): Promise<GuideInterface> {
    if (user && user.role !== RoleType.CREATOR)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        title: "Unauthorized",
        message: "You are not authorized to edit this guide",
      });

    const guide: any = await this.guideModel
      .findOne({ slug, mainCreator: new Types.ObjectId(user?.id) })
      .lean()
      .exec();

    if (!guide)
      throw new NotFoundException(`Guide with slug ${slug} not found.`);

    if (guide.category) {
      const categoryData = await this.fetchCategoryById(
        guide.category.toString(),
      );
      if (categoryData) guide.category = categoryData;
    }

    if (Array.isArray(guide.subcategories) && guide.subcategories.length > 0) {
      const subcategoriesData = (
        await Promise.all(
          guide.subcategories.map((id) =>
            this.fetchSubcategoryById(id.toString()),
          ),
        )
      ).filter(Boolean);
      guide.subcategories = subcategoriesData;
    }

    // Ownership
    const isOwner = user !== null && guide.mainCreator?.toString() === user.id;

    if (!isOwner)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You do not have access to this guide.",
      });

    return guide;
  }

  async publishGuide(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
    const user = await this.fetchUserData(userId);
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.profileInfo?.roleId?.name !== RoleType.CREATOR)
      return { success: false, error: "You are not a creator." };

    if (
      user.financialInfo?.stripeVerified !== true ||
      user.financialInfo?.stripeAccountId === null ||
      user.financialInfo?.stripeAccountId === undefined
    )
      return {
        success: false,
        error:
          "You are not authorized to publish a guide because you are not verified as a creator or you do not have a stripe account.",
      };

    const existingGuide = await this.guideModel
      .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
      .exec();

    if (!existingGuide)
      return {
        success: false,
        error: "Guide not found or you are not the owner",
      };

    const updatedGuide = await this.guideModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: GUIDE_STATUS.PUBLISHED,
          publishedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  }

  async unpublishGuide(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
    const isPurchased = await this.checkIfGuidePurchased(id);
    if (isPurchased.purchased)
      return {
        success: false,
        error: `Guide has been purchased and cannot be unpublished`,
      };

    const existingGuide = await this.guideModel
      .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
      .exec();

    if (!existingGuide)
      return {
        success: false,
        error: `Guide not found or you are not the owner`,
      };

    if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
      return {
        success: false,
        error: `Guide has been purchased and cannot be unpublished`,
      };

    const updatedGuide = await this.guideModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: GUIDE_STATUS.DRAFT,
          unpublishedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  }

  async archiveGuide(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
    const isPurchased = await this.checkIfGuidePurchased(id);
    if (isPurchased.purchased)
      return {
        success: false,
        error: `Guide has been purchased and cannot be archived`,
      };

    const existingGuide = await this.guideModel
      .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
      .exec();

    if (!existingGuide)
      return {
        success: false,
        error: `Guide not found or you are not the owner`,
      };

    if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
      return {
        success: false,
        error: `Guide has been purchased and cannot be archived`,
      };

    const updatedGuide = await this.guideModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: GUIDE_STATUS.ARCHIVED,
          archivedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  }

  async unarchiveGuide(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; status?: GUIDE_STATUS; error?: string }> {
    const existingGuide = await this.guideModel
      .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
      .exec();

    if (!existingGuide)
      return {
        success: false,
        error: `Guide not found or you are not the owner`,
      };

    const updatedGuide = await this.guideModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: GUIDE_STATUS.DRAFT,
          unarchivedAt: new Date(),
          lastEditedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );

    return { success: true, status: updatedGuide?.status as GUIDE_STATUS };
  }

  async deleteGuide(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const isPurchased = await this.checkIfGuidePurchased(id);
    if (isPurchased.purchased)
      return {
        success: false,
        error: `Guide has been purchased and cannot be deleted`,
      };

    const existingGuide = await this.guideModel
      .findOne({ _id: id, mainCreator: new Types.ObjectId(userId) })
      .exec();

    if (!existingGuide)
      return {
        success: false,
        error: `Guide not found or you are not the owner`,
      };

    if (existingGuide.purchaseCount && existingGuide.purchaseCount > 0)
      return {
        success: false,
        error: `Guide has been purchased and cannot be deleted`,
      };

    if (existingGuide.publishedAt && existingGuide.publishedAt !== null)
      return {
        success: false,
        error: `Guide has already been published and cannot be deleted`,
      };

    const result = await this.guideModel.deleteOne({ _id: id });

    return {
      success: result.deletedCount === 1,
    };
  }

  async reportGuide(
    guideId: string,
    dto: ReportGuideDto,
    userId: string,
  ): Promise<boolean> {
    const guide = await this.guideModel.findById(guideId).exec();
    if (!guide)
      throw new NotFoundException(`Guide with ID ${guideId} not found`);

    if (guide.mainCreator?.toString() === userId)
      throw new ForbiddenException("You cannot report your own guide.");

    const report = new this.guideReportModel({
      guideId: new Types.ObjectId(guideId),
      userId: new Types.ObjectId(userId),
      reason: dto.reason,
      message: dto.message,
      reportedAt: new Date(),
    });

    const savedReport = await report.save();
    if (!savedReport) return false;
    return true;
  }

  async reportLink(
    guideId: string,
    dto: ReportLinkDto,
    userId: string,
  ): Promise<boolean> {
    const guide = await this.guideModel.findById(guideId).exec();
    if (!guide)
      throw new NotFoundException(`Guide with ID ${guideId} not found`);

    if (guide.mainCreator?.toString() === userId)
      throw new ForbiddenException("You cannot report your own link.");

    const report = new this.linkReportModel({
      guideId: new Types.ObjectId(guideId),
      linkItemId: new Types.ObjectId(dto.linkItemId),
      linkType: dto.linkType,
      link: dto.link,
      userId: new Types.ObjectId(userId),
      reason: dto.reason,
      reportedAt: new Date(),
    });

    const savedReport = await report.save();
    if (!savedReport) return false;
    return true;
  }

  getAllGuides(categoryId?: string): Promise<GuideDocument[]> {
    const query: any = {};
    if (categoryId) {
      query.category = new Types.ObjectId(categoryId);
    }
    return this.guideModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async getGuidesByCreator(
    creatorId: string,
    userId: string,
  ): Promise<GuideDocument[] | null> {
    const user = await this.fetchUserData(userId);

    if (user?.profileInfo?.roleId?.name !== RoleType.CREATOR)
      throw new ForbiddenException(
        "You are not authorized to access this resource",
      );

    if (creatorId !== userId)
      throw new ForbiddenException(
        "You are not authorized to access guides created by other creators",
      );

    const guides = await this.guideModel
      .find({ mainCreator: new Types.ObjectId(creatorId) })
      .sort({ createdAt: -1 })
      .exec();

    if (guides.length === 0) return null;
    return guides;
  }

  getPublicGuidesByCreator(creatorId: string): Promise<GuideDocument[]> {
    return this.guideModel
      .find({
        mainCreator: new Types.ObjectId(creatorId),
        visibility: VISIBILITY_TYPE.PUBLIC,
        status: GUIDE_STATUS.PUBLISHED,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async toggleSaveGuide(
    guideId: string,
    userId: string,
  ): Promise<{ saved: boolean }> {
    const existingSavedGuide = await this.savedGuideModel.deleteOne({
      guideId: new Types.ObjectId(guideId),
      userId: new Types.ObjectId(userId),
    });

    if (existingSavedGuide.deletedCount > 0) return { saved: false };

    const newSavedGuide = await this.savedGuideModel.create({
      guideId: new Types.ObjectId(guideId),
      userId: new Types.ObjectId(userId),
    });

    if (!newSavedGuide)
      throw new BadRequestException({
        code: "FAILED_TO_SAVE_GUIDE",
        message: "Failed to save guide",
      });

    return { saved: true };
  }

  async isGuideSaved(guideId: string, userId: string): Promise<boolean> {
    const savedGuide = await this.savedGuideModel
      .findOne({
        guideId: new Types.ObjectId(guideId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return savedGuide ? true : false;
  }

  async getSavedGuides(userId: string): Promise<SavedGuideDocument[]> {
    const userObjectId = new Types.ObjectId(userId);

    const pipeline: PipelineStage[] = [
      // 1. Only this user's saved guides
      {
        $match: {
          userId: userObjectId,
        },
      },
      // 2. Join guides
      {
        $lookup: {
          from: "guides",
          localField: "guideId",
          foreignField: "_id",
          as: "guide",
        },
      },
      // 3. Flatten
      {
        $unwind: "$guide",
      },
      // 4. Only visible + published guides
      {
        $match: {
          "guide.status": GUIDE_STATUS.PUBLISHED,
          "guide.visibility": VISIBILITY_TYPE.PUBLIC,
        },
      },
      // 5. Shape response for Saved Guides UI
      {
        $project: {
          _id: 0,
          savedAt: "$createdAt",
          guideId: "$guide._id",
          slug: "$guide.slug",
          title: "$guide.title",
          price: "$guide.price",
          currency: "$guide.currency",
          difficulty: "$guide.difficulty",
          estimatedDurationMinutes: "$guide.estimatedDurationMinutes",
          media: {
            thumbnailId: "$guide.media.thumbnailId",
          },
          mainCreatorSnapshot: "$guide.mainCreatorSnapshot",
        },
      },
      // 6. Most recently saved first
      {
        $sort: {
          savedAt: -1,
        },
      },
    ];

    const savedGuides = await this.savedGuideModel.aggregate(pipeline).exec();

    return savedGuides;
  }

  ///
  /// ----------------------------- ADMIN FACING METHODS -----------------------------
  ///

  async findAdminGuides({
    page,
    limit,
    sortBy,
    sortOrder,
    status,
    visibility,
    search,
  }: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    status?: GUIDE_STATUS;
    visibility?: VISIBILITY_TYPE;
    search?: string;
  }) {
    const query: any = {};

    if (status) query["status"] = status;
    if (visibility) query["visibility"] = visibility;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sort: any = {};
    sort[sortBy === "createdAt" ? "createdAt" : "updatedAt"] =
      sortOrder === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    const [guides, total] = await Promise.all([
      this.guideModel.aggregate([
        { $match: query },

        {
          $lookup: {
            from: "guide_reports",
            let: { guideId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$guideId", "$$guideId"] },
                  status: GuideReportStatus.ACCEPTED,
                },
              },
              { $count: "count" },
            ],
            as: "reportData",
          },
        },

        {
          $addFields: {
            acceptedReportCount: {
              $ifNull: [{ $arrayElemAt: ["$reportData.count", 0] }, 0],
            },
          },
        },

        {
          $project: {
            reportData: 0,
          },
        },

        {
          $lookup: {
            from: "guide_link_reports",
            let: { guideId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$guideId", "$$guideId"] },
                  status: GuideLinkReportStatus.ACCEPTED,
                },
              },
              {
                $group: {
                  _id: "$linkItemId",
                  count: { $sum: 1 },
                },
              },
            ],
            as: "acceptedLinkReportStats",
          },
        },

        {
          $addFields: {
            acceptedLinkReportStats: {
              $map: {
                input: "$acceptedLinkReportStats",
                as: "stat",
                in: {
                  linkItemId: "$$stat._id",
                  count: "$$stat.count",
                },
              },
            },
          },
        },

        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
      ]),

      this.guideModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: guides,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAdminGuideReports({
    page,
    limit,
    sortBy,
    sortOrder,
    status,
    reason,
  }: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    status?: GuideReportStatus;
    reason?: GuideReportReason;
  }) {
    const query: any = {};

    if (status) query["status"] = status;
    if (reason) query["reason"] = reason;

    const sort: any = {};
    sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
      sortOrder === "asc" ? -1 : 1;

    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.guideReportModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .populate("guideId", "title description slug")
        .limit(limit)
        .lean(),
      this.guideReportModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: reports,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAdminGuideLinkReports({
    page,
    limit,
    sortBy,
    sortOrder,
    status,
    reason,
  }: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
    status?: GuideLinkReportStatus;
    reason?: GuideLinkReportReason;
  }) {
    const query: any = {};

    if (status) query["status"] = status;
    if (reason) query["reason"] = reason;

    const sort: any = {};
    sort[sortBy === "createdAt" ? "createdAt" : "createdAt"] =
      sortOrder === "asc" ? -1 : 1;

    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.linkReportModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .populate("guideId", "title description slug")
        .limit(limit)
        .lean(),
      this.linkReportModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: reports,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateGuideStatus(guideId: string, status: GUIDE_STATUS) {
    const guide = await this.guideModel
      .findByIdAndUpdate(guideId, { status }, { new: true })
      .exec();

    if (!guide) throw new NotFoundException(`Guide not found`);

    return guide;
  }

  async takeGuideReportAction(
    reportId: string,
    status: GuideReportStatus,
  ): Promise<GuideReportDocument> {
    const report = await this.guideReportModel.findByIdAndUpdate(
      reportId,
      {
        status,
      },
      { new: true },
    );

    if (!report) throw new NotFoundException("Guide report not found");
    return report;
  }

  async disableLink(
    guideId: string,
    linkItemId: string,
    linkType: GuideLinkType,
  ) {
    const field = linkType === GuideLinkType.TOOL ? "tools" : "materials";

    await this.guideModel.updateOne(
      { _id: guideId },
      {
        $set: {
          [`${field}.$[elem].isLinkDisabled`]: true,
        },
      },
      {
        arrayFilters: [{ "elem._id": new Types.ObjectId(linkItemId) }],
      },
    );
  }

  async takeGuideLinkReportAction(
    reportId: string,
    status: GuideLinkReportStatus,
  ): Promise<LinkReportDocument> {
    const report = await this.linkReportModel.findById(reportId);

    if (!report) throw new NotFoundException("Guide link report not found");

    if (report.status === status) return report;

    report.status = status;
    await report.save();

    if (status === GuideLinkReportStatus.ACCEPTED) {
      const FLAG_THRESHOLD = 5;

      const acceptedCount = await this.linkReportModel.countDocuments({
        guideId: report.guideId,
        linkItemId: report.linkItemId,
        status: GuideLinkReportStatus.ACCEPTED,
      });

      if (acceptedCount >= FLAG_THRESHOLD) {
        await this.disableLink(
          report.guideId.toString(),
          report.linkItemId.toString(),
          report.linkType,
        );
      }
    }

    return report;
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE METHODS -----------------------------
  ///

  async getGuideForPurchase(guideId: string) {
    const guide = await this.guideModel
      .findOne(
        {
          _id: guideId,
        },
        {
          _id: 1,
          price: 1,
          visibility: 1,
          mainCreator: 1,
          currency: 1,
          title: 1,
          slug: 1,
          status: 1,
          media: {
            thumbnailId: 1,
            guideFile: 1,
          },
        },
      )
      .lean<PurchaseGuideResponse>()
      .exec();

    if (!guide)
      throw new NotFoundException(`Guide with ID ${guideId} not found`);
    return guide;
  }

  async incrementPurchaseCount(id: string): Promise<void> {
    await this.guideModel.findByIdAndUpdate(id, {
      $inc: { purchaseCount: 1 },
    });
  }

  ///
  /// ----------------------------- MODERATION METHODS -----------------------------
  ///

  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private generateRandomTimestamps(
    duration: number,
    ranges: [number, number][],
  ): number[] {
    return ranges.map(([min, max]) => {
      const base = (duration * this.randomBetween(min, max)) / 100;
      const jitter = this.randomBetween(-2, 2);
      return Math.max(0, Math.floor(base + jitter));
    });
  }

  private async runModerationCheck(dto: CreateGuideDto): Promise<void> {
    const mainVideoUID = dto.media.mainVideo.streamId;

    const previewVideo = dto.media.previewVideo;
    const previewSource = previewVideo?.source;
    const previewVideoUID = previewVideo?.streamId;

    const images = dto.media.images || [];

    const title = dto.title;
    const description = dto.description;
    const safetyNotes = dto.safetyNotes;

    const videoDetails = await this.fetchVideoDetails(mainVideoUID);

    if (!videoDetails.readyToStream) {
      throw new BadRequestException(
        "Video is still processing. Please try again in a moment.",
      );
    }

    const duration = Math.floor(videoDetails.duration);

    if (duration <= 60)
      throw new BadRequestException({
        title: "Video duration too short",
        message:
          "The main video duration is too short. Please adjust the main video duration to be at least 60 seconds.",
      });

    const ranges: [number, number][] = [
      [5, 25],
      [35, 65],
      [75, 95],
    ];

    const timestamps = this.generateRandomTimestamps(duration, ranges);

    const accessToken = await this.fetchAccessTokenForMedia(mainVideoUID, 300);

    const thumbnailUrls = timestamps.map(
      (time) =>
        `https://videodelivery.net/${mainVideoUID}/${accessToken.videoToken}/thumbnails/thumbnail.jpg?time=${time}s&height=720`,
    );

    let previewThumbnailUrls: string[] = [];

    if (previewSource === VIDEO_ASSET_SOURCE.UPLOADED && previewVideoUID) {
      const previewDetails = await this.fetchVideoDetails(previewVideoUID);

      if (!previewDetails.readyToStream) {
        throw new BadRequestException(
          "Preview video is still processing. Please try again in a moment.",
        );
      }

      const previewDuration = Math.floor(previewDetails.duration);

      if (previewDuration > duration)
        throw new BadRequestException({
          title: "Video duration mismatch",
          message:
            "The preview video duration is longer than the main video duration. Please adjust the preview video duration to be less than the main video duration.",
        });

      const previewRanges: [number, number][] = [
        [20, 40],
        [60, 90],
      ];

      const previewTimestamps = this.generateRandomTimestamps(
        previewDuration,
        previewRanges,
      );

      previewThumbnailUrls = previewTimestamps.map(
        (time) =>
          `https://videodelivery.net/${previewVideoUID}/thumbnails/thumbnail.jpg?time=${time}s`,
      );
    }

    const r2Base = this.configService.get<string>("R2_IMAGE_PUBLIC_URL");

    const imageUrls = images
      .map((key) => key?.trim())
      .filter((key): key is string => Boolean(key))
      .map((key) => `${r2Base}/${key}`);

    const tools = dto.tools || [];
    const materials = dto.materials || [];

    const toolNames = tools
      .map((tool) => tool?.name?.trim())
      .filter((name): name is string => Boolean(name));

    const materialNames = materials
      .map((material) => material?.name?.trim())
      .filter((name): name is string => Boolean(name));

    const textTargets = [
      { text: title, label: "Title" },
      { text: description, label: "Description" },
      ...(safetyNotes ? [{ text: safetyNotes, label: "Safety notes" }] : []),
      ...toolNames.map((t) => ({ text: t, label: "Tool name" })),
      ...materialNames.map((m) => ({ text: m, label: "Material name" })),
    ];

    const mainVideoTargets: VisualModerationTarget[] = thumbnailUrls.map(
      (url) => ({
        url,
        label: "Main video",
      }),
    );

    const previewVideoTargets: VisualModerationTarget[] =
      previewThumbnailUrls.map((url) => ({
        url,
        label: "Preview video",
      }));

    const imageTargets: VisualModerationTarget[] = imageUrls.map(
      (url, index) => ({
        url,
        label: `Image #${index + 1}`,
      }),
    );

    await this.moderateTexts(textTargets);
    await this.moderateVideoFrames(previewVideoTargets);
    await this.moderateVideoFrames(mainVideoTargets);
    await this.moderateImages(imageTargets);
  }

  private async runModerationCheckForUpdate(
    dto: UpdateGuideDto,
  ): Promise<void> {
    if (dto.media?.mainVideo?.streamId !== undefined) {
      const mainVideoUID = dto.media.mainVideo.streamId;
      const videoDetails = await this.fetchVideoDetails(mainVideoUID);

      if (!videoDetails.readyToStream) {
        throw new BadRequestException(
          "Video is still processing. Please try again in a moment.",
        );
      }

      const duration = Math.floor(videoDetails.duration);

      const ranges: [number, number][] = [
        [5, 25],
        [35, 65],
        [75, 95],
      ];

      const timestamps = this.generateRandomTimestamps(duration, ranges);

      const accessToken = await this.fetchAccessTokenForMedia(
        mainVideoUID,
        300,
      );

      const thumbnailUrls = timestamps.map(
        (time) =>
          `https://videodelivery.net/${mainVideoUID}/${accessToken.videoToken}/thumbnails/thumbnail.jpg?time=${time}s&height=720`,
      );

      const mainVideoTargets: VisualModerationTarget[] = thumbnailUrls.map(
        (url) => ({
          url,
          label: "Main video",
        }),
      );

      await this.moderateVideoFrames(mainVideoTargets);
    }

    if (dto.media?.previewVideo?.streamId !== undefined) {
      const previewVideo = dto.media?.previewVideo;
      const previewSource = previewVideo?.source;
      const previewVideoUID = previewVideo?.streamId;

      let previewThumbnailUrls: string[] = [];

      if (previewSource === VIDEO_ASSET_SOURCE.UPLOADED && previewVideoUID) {
        const previewDetails = await this.fetchVideoDetails(previewVideoUID);

        if (!previewDetails.readyToStream) {
          throw new BadRequestException(
            "Preview video is still processing. Please try again in a moment.",
          );
        }

        const previewDuration = Math.floor(previewDetails.duration);

        const previewRanges: [number, number][] = [
          [20, 40],
          [60, 90],
        ];

        const previewTimestamps = this.generateRandomTimestamps(
          previewDuration,
          previewRanges,
        );

        previewThumbnailUrls = previewTimestamps.map(
          (time) =>
            `https://videodelivery.net/${previewVideoUID}/thumbnails/thumbnail.jpg?time=${time}s`,
        );
      }

      const previewVideoTargets: VisualModerationTarget[] =
        previewThumbnailUrls.map((url) => ({
          url,
          label: "Preview video",
        }));

      await this.moderateVideoFrames(previewVideoTargets);
    }

    if (
      dto.media &&
      dto.media.images !== undefined &&
      dto.media.images.length > 0
    ) {
      const images = dto.media.images;

      const r2Base = this.configService.get<string>("R2_IMAGE_PUBLIC_URL");

      const imageUrls = images
        .map((key) => key?.trim())
        .filter((key): key is string => Boolean(key))
        .map((key) => `${r2Base}/${key}`);

      const imageTargets: VisualModerationTarget[] = imageUrls.map(
        (url, index) => ({
          url,
          label: `Image #${index + 1}`,
        }),
      );

      await this.moderateImages(imageTargets);
    }

    if (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.safetyNotes !== undefined ||
      dto.tools !== undefined ||
      dto.materials !== undefined
    ) {
      const title = dto.title || "";
      const description = dto.description || "";
      const safetyNotes = dto.safetyNotes || "";

      const tools = dto.tools || [];
      const materials = dto.materials || [];

      const toolNames = tools
        .map((tool) => tool?.name?.trim())
        .filter((name): name is string => Boolean(name));

      const materialNames = materials
        .map((material) => material?.name?.trim())
        .filter((name): name is string => Boolean(name));

      const textTargets = [
        { text: title, label: "Title" },
        { text: description, label: "Description" },
        ...(safetyNotes ? [{ text: safetyNotes, label: "Safety notes" }] : []),
        ...toolNames.map((t) => ({ text: t, label: "Tool name" })),
        ...materialNames.map((m) => ({ text: m, label: "Material name" })),
      ];

      await this.moderateTexts(textTargets);
    }
  }

  private async moderateVideoFrames(
    targets: VisualModerationTarget[],
  ): Promise<void> {
    if (!targets.length) return;

    const apiUser = this.configService.get<string>("SIGHTENGINE_API_USER");
    const apiSecret = this.configService.get<string>("SIGHTENGINE_API_SECRET");

    if (!apiUser || !apiSecret)
      throw new Error("Sightengine credentials missing");

    const BATCH_SIZE = 5;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      const checks = batch.map((target) =>
        firstValueFrom(
          this.httpService.get("https://api.sightengine.com/1.0/check.json", {
            params: {
              models: "nudity-2.1,violence,gore-2.0",
              url: target.url,
              api_user: apiUser,
              api_secret: apiSecret,
            },
            timeout: SIGHTENGINE_TIMEOUT_MS,
          }),
        ),
      );

      let responses;

      try {
        responses = await Promise.all(checks);
      } catch (error) {
        console.error("Sightengine image moderation error:", error);
        return; // skip moderation if API fails
      }

      for (let j = 0; j < responses.length; j++) {
        const result = responses[j].data;
        const target = batch[j];

        if (!result || result.status !== "success") continue;

        const nudity = result.nudity;
        const violence = result.violence;
        const gore = result.gore;

        const unsafe =
          (nudity?.sexual_activity ?? 0) > 0.6 ||
          (nudity?.sexual_display ?? 0) > 0.6 ||
          (nudity?.erotica ?? 0) > 0.6 ||
          (nudity?.very_suggestive ?? 0) > 0.9 ||
          (violence?.prob ?? 0) > 0.7 ||
          (gore?.prob ?? 0) > 0.7;

        if (unsafe) {
          throw new BadRequestException({
            title: "Content safety issue",
            message:
              "Some uploaded media could not pass our content safety check. ",
            details:
              "Please review the flagged items and remove or replace any content that may violate our guidelines before trying again",
            flaggedItems: [target.label],
          });
        }
      }
    }
  }

  private async moderateImages(
    targets: VisualModerationTarget[],
  ): Promise<void> {
    if (!targets.length) return;

    const apiUser = this.configService.get<string>("SIGHTENGINE_API_USER");
    const apiSecret = this.configService.get<string>("SIGHTENGINE_API_SECRET");

    if (!apiUser || !apiSecret)
      throw new Error("Sightengine credentials missing");

    const BATCH_SIZE = 5;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      const checks = batch.map((target) =>
        firstValueFrom(
          this.httpService.get("https://api.sightengine.com/1.0/check.json", {
            params: {
              models: "nudity-2.1,violence,gore-2.0",
              url: target.url,
              api_user: apiUser,
              api_secret: apiSecret,
            },
            timeout: SIGHTENGINE_TIMEOUT_MS,
          }),
        ),
      );

      let responses;

      try {
        responses = await Promise.all(checks);
      } catch (error) {
        console.error("Sightengine image moderation error:", error);
        return; // skip moderation if API fails
      }

      for (let j = 0; j < responses.length; j++) {
        const result = responses[j].data;
        const target = batch[j];

        if (!result || result.status !== "success") continue;

        const nudity = result.nudity;
        const violence = result.violence;
        const gore = result.gore;

        const unsafe =
          (nudity?.sexual_activity ?? 0) > 0.6 ||
          (nudity?.sexual_display ?? 0) > 0.6 ||
          (nudity?.erotica ?? 0) > 0.6 ||
          (nudity?.very_suggestive ?? 0) > 0.9 ||
          (violence?.prob ?? 0) > 0.7 ||
          (gore?.prob ?? 0) > 0.7;

        if (unsafe) {
          throw new BadRequestException({
            title: "Content safety issue",
            message:
              "One or more uploaded images could not pass our content safety check.",
            details:
              "Please replace the flagged images and ensure all uploads follow Mystor's content guidelines",
            flaggedItems: [target.label],
          });
        }
      }
    }
  }

  private async moderateTexts(
    targets: { text: string; label: string }[],
  ): Promise<void> {
    if (!targets.length) return;

    const apiUser = this.configService.get<string>("SIGHTENGINE_API_USER");
    const apiSecret = this.configService.get<string>("SIGHTENGINE_API_SECRET");

    if (!apiUser || !apiSecret)
      throw new Error("Sightengine credentials missing");

    for (const target of targets) {
      let response;

      try {
        response = await firstValueFrom(
          this.httpService.get(
            "https://api.sightengine.com/1.0/text/check.json",
            {
              params: {
                text: target.text,
                lang: "en",
                mode: "standard",
                api_user: apiUser,
                api_secret: apiSecret,
              },
              timeout: SIGHTENGINE_TIMEOUT_MS,
            },
          ),
        );
      } catch (error) {
        console.error("Sightengine text moderation error:", error);
        continue;
      }

      const result = response.data;

      if (!result || result.status !== "success") continue;

      const matches = result.profanity?.matches ?? [];

      const blocked = matches.some((m: any) => {
        if (m.intensity === "high" || m.intensity === "very_high") return true;
        if (m.type === "hate") return true;
        if (m.type === "sexual") return true;
        return false;
      });

      if (blocked) {
        throw new BadRequestException({
          title: "Content safety issue",
          message: "Some of the text content could not be accepted.",
          details:
            "Please review the highlighted fields and remove any language that may violate our content guidelines",
          flaggedItems: [target.label],
        });
      }
    }
  }
}
