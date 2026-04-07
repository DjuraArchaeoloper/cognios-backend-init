import {
  Injectable,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
  OnModuleInit,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Purchase, PurchaseDocument } from "./schemas/purchase.schema";
import {
  CreatorEarnings,
  CreatorEarningsResponse,
  GuidesEligibleForRefundResponse,
  InternalPurchaseStatus,
  PurchaseInterface,
  UserPayments,
  UserPaymentsResponse,
  UserPurchasesResponse,
} from "./types/types";
import { RefundsService } from "src/refunds/refunds.service";
import {
  SystemSettings,
  SystemSettingsDocument,
} from "./schemas/system-settings";
import { GUIDE_STATUS } from "src/guides/types/guides";
import { convertLamportsToSol } from "src/guides/utils/pricing";

@Injectable()
export class PurchasesService implements OnModuleInit {
  private readonly logger = new Logger(PurchasesService.name);
  private readonly guidesServiceUrl: string;
  private readonly authServiceUrl: string;

  constructor(
    @InjectModel(Purchase.name)
    private purchaseModel: Model<PurchaseDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    private configService: ConfigService,
    private httpService: HttpService,
    @Inject(forwardRef(() => RefundsService))
    private refundsService: RefundsService,
  ) {
    this.guidesServiceUrl =
      this.configService.get<string>("GUIDES_SERVICE_URL") || "";
    this.authServiceUrl =
      this.configService.get<string>("AUTH_SERVICE_URL") || "";
  }

  async onModuleInit() {
    await this.seedSystemSettingsIfMissing();
  }

  private getRefundEligibility(purchase: {
    refundableUntil?: Date | null;
    videoPlaybackInitiatedAt?: Date | null;
    pdfAccessedAt?: Date | null;
  }) {
    const now = new Date();

    const isWithinRefundWindow =
      !!purchase.refundableUntil &&
      purchase.refundableUntil.getTime() > now.getTime();

    const hasAccessedVideo = !!purchase.videoPlaybackInitiatedAt;

    const hasAccessedPdf = !!purchase.pdfAccessedAt;

    const isRefundable =
      isWithinRefundWindow && !hasAccessedVideo && !hasAccessedPdf;

    return {
      isRefundable,
      isWithinRefundWindow,
      hasAccessedVideo,
      hasAccessedPdf,
      refundableUntil: purchase.refundableUntil ?? null,
    };
  }

  async fetchUserData(userId: string): Promise<{
    _id: string;
    profileInfo?: {
      username?: string;
      email?: string;
      accountStatus?: string;
    };
    financialInfo?: {
      platformFeePercentage: number;
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
          accountStatus: user.profileInfo?.accountStatus,
        },
        financialInfo: {
          stripeVerified: user.financialInfo?.stripeVerified,
          stripeAccountId: user.financialInfo?.stripeAccountId,
          platformFeePercentage: user.financialInfo?.platformFeePercentage,
        },
      };
    } else throw new Error(`Failed to fetch user data for userId ${userId}`);
  }

  private async getGuideForPurchase(guideId: string): Promise<{
    _id: string;
    price: number;
    currency: string;
    visibility: string;
    mainCreator: string;
    title: string;
    slug: string;
    status: GUIDE_STATUS;
    error?: string;
    media: {
      thumbnailId: string;
      guideFile?: {
        fileKey: string;
      };
    };
  }> {
    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.guidesServiceUrl}/guides/${guideId}/internal`,
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (!response.data?.success || !response.data?.data)
      return {
        _id: "",
        price: 0,
        currency: "",
        visibility: "",
        mainCreator: "",
        title: "",
        slug: "",
        status: GUIDE_STATUS.DRAFT,
        error: "Guide not found",
        media: {
          thumbnailId: "",
        },
      };

    return response.data.data;
  }

  private calculatePlatformFee(
    platformFeePercentage: number, // e.g. 15
    priceInCents: number, // e.g. 900
  ): {
    platformFeePercent: number;
    platformFeeAmount: number;
    creatorEarnings: number;
  } {
    const platformFeePercent = platformFeePercentage ?? 0;

    if (platformFeePercent < 0 || platformFeePercent > 100)
      throw new Error("Invalid platform fee percentage");

    if (!Number.isInteger(priceInCents) || priceInCents < 0)
      throw new Error("Price must be a positive integer in cents");

    const platformFeeAmount = Math.round(
      (priceInCents * platformFeePercent) / 100,
    );

    const creatorEarnings = priceInCents - platformFeeAmount;

    return {
      platformFeePercent,
      platformFeeAmount,
      creatorEarnings,
    };
  }

  async updatePurchaseRefunded(purchaseId: string, refundReason: string) {
    const purchase = await this.purchaseModel.findByIdAndUpdate(purchaseId, {
      $set: {
        refunded: true,
        refundedAt: new Date(),
        refundReason,
      },
    });

    if (!purchase) return null;
    return purchase;
  }

  async verifyPurchaseBySession(
    sessionId: string,
    userId: string,
  ): Promise<{
    verified: boolean;
  }> {
    const purchase = await this.purchaseModel.findOne({
      stripeCheckoutSessionId: sessionId,
      userId: new Types.ObjectId(userId),
      internalStatus: InternalPurchaseStatus.PAID,
      refunded: false,
    });

    if (!purchase) return { verified: false };

    return {
      verified: true,
    };
  }

  async checkIfGuidePurchased(guideId: string): Promise<{
    purchased: boolean;
  }> {
    const purchase = await this.purchaseModel.findOne({
      guideId: new Types.ObjectId(guideId),
      internalStatus: InternalPurchaseStatus.PAID,
      refunded: false,
    });

    if (!purchase) return { purchased: false };

    return {
      purchased: true,
    };
  }

  async getUserPurchases(
    userId: string,
  ): Promise<UserPurchasesResponse[] | null> {
    const purchases = await this.purchaseModel
      .find({
        userId: new Types.ObjectId(userId),
        internalStatus: InternalPurchaseStatus.PAID,
        refunded: false,
      })
      .lean()
      .exec();

    if (!purchases || purchases.length === 0) return [];

    const userPurchases: UserPurchasesResponse[] = [];

    for (const purchase of purchases) {
      const guide = await this.getGuideForPurchase(purchase.guideId.toString());
      const creator = await this.fetchUserData(purchase.creatorId.toString());

      if (!guide) continue;

      userPurchases.push({
        title: guide.title,
        slug: guide.slug,
        thumbnailId: guide.media.thumbnailId,
        creatorName: creator?.profileInfo?.username || "",
      });
    }

    return userPurchases;
  }

  async getCreatorEarnings(
    creatorId: string,
  ): Promise<CreatorEarningsResponse | null> {
    const earnings = await this.purchaseModel
      .find({
        creatorId: new Types.ObjectId(creatorId),
        internalStatus: InternalPurchaseStatus.PAID,
        refunded: false,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!earnings) return null;

    const creatorEarnings: CreatorEarnings[] = [];
    let totalEarnings = 0;
    let totalSales = 0;
    let totalPrice = 0;

    for (const earning of earnings) {
      const guide = await this.getGuideForPurchase(earning.guideId.toString());
      if (!guide) continue;

      totalEarnings += earning.creatorEarningsAmount || 0;
      totalSales += 1;
      totalPrice += earning.priceAtPurchase || 0;

      creatorEarnings.push({
        _id: earning._id.toString(),
        creatorId: earning.creatorId.toString(),
        earnings: convertLamportsToSol(earning.creatorEarningsAmount || 0),
        price: convertLamportsToSol(earning.priceAtPurchase || 0),
        guideTitle: guide.title,
        guideSlug: guide.slug,
        guideCurrency: guide.currency,
        internalStatus: earning.internalStatus || "",
        createdAt: earning.createdAt || null,
      });
    }

    return {
      creatorEarnings,
      totalSales,
      totalEarnings: convertLamportsToSol(totalEarnings),
      totalPrice: convertLamportsToSol(totalPrice),
    };
  }

  async getUserPayments(userId: string): Promise<UserPaymentsResponse | null> {
    const payments = await this.purchaseModel
      .find({
        userId: new Types.ObjectId(userId),
        internalStatus: InternalPurchaseStatus.PAID,
        refunded: false,
      })
      .lean()
      .exec();

    if (!payments) return null;

    const userPayments: UserPayments[] = [];
    let totalPayments = 0;

    for (const payment of payments) {
      const guide = await this.getGuideForPurchase(payment.guideId.toString());
      if (!guide) continue;

      totalPayments += payment.priceAtPurchase || 0;

      userPayments.push({
        _id: payment._id.toString(),
        price: convertLamportsToSol(payment.priceAtPurchase || 0),
        guideTitle: guide.title,
        guideSlug: guide.slug,
        guideCurrency: guide.currency,
        internalStatus: payment.internalStatus || "",
        createdAt: payment.createdAt || null,
      });
    }

    return {
      userPayments,
      totalPayments: convertLamportsToSol(totalPayments),
    };
  }

  async markVideoPlaybackInitiated(
    userId: string,
    guideId: string,
    videoPlaybackUrl: string,
  ) {
    const result = await this.purchaseModel.updateOne(
      {
        userId,
        guideId,
        videoPlaybackInitiatedAt: null,
        refunded: false,
      },
      {
        $set: {
          videoPlaybackInitiatedAt: new Date(),
          videoPlaybackUrl,
        },
      },
      {
        runValidators: false,
      },
    );

    if (result.matchedCount === 0) {
      const exists = await this.purchaseModel.exists({
        userId,
        guideId,
        refunded: false,
      });
      if (!exists) throw new ForbiddenException("Guide not purchased");
    }

    return { success: true };
  }

  async getGuidesEligibleForRefund(
    userId: string,
  ): Promise<GuidesEligibleForRefundResponse[]> {
    const purchases = await this.purchaseModel
      .find({
        userId: new Types.ObjectId(userId),
        internalStatus: InternalPurchaseStatus.PAID,
        refunded: false,
      })
      .lean()
      .exec();

    if (!purchases || purchases.length === 0) return [];

    const userPurchases: GuidesEligibleForRefundResponse[] = [];

    for (const purchase of purchases) {
      const { isRefundable } = this.getRefundEligibility(purchase);
      if (!isRefundable) continue;

      const guide = await this.getGuideForPurchase(purchase.guideId.toString());
      if (!guide) continue;

      userPurchases.push({
        _id: guide._id.toString(),
        title: guide.title,
        purchaseId: purchase._id.toString(),
      });
    }

    return userPurchases;
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE METHODS -----------------------------
  ///

  async getPurchaseAccessInternal(
    userId: string,
    guideId: string,
  ): Promise<{
    hasAccess: boolean;
    isRefundable?: boolean;
    isWithinRefundWindow?: boolean;
    hasAccessedVideo?: boolean;
    hasAccessedPdf?: boolean;
    purchase?: PurchaseInterface;
  }> {
    if (!userId || !guideId) return { hasAccess: false };

    const userIdObj = new Types.ObjectId(userId);
    const guideIdObj = new Types.ObjectId(guideId);

    const purchase: PurchaseInterface | null = await this.purchaseModel.findOne(
      {
        userId: userIdObj,
        guideId: guideIdObj,
        internalStatus: InternalPurchaseStatus.PAID,
        refunded: false,
      },
    );

    if (!purchase) return { hasAccess: false };

    const {
      isRefundable,
      isWithinRefundWindow,
      hasAccessedVideo,
      hasAccessedPdf,
    } = this.getRefundEligibility(purchase);

    const refund = await this.refundsService.getRefundByPurchaseAndGuideId(
      purchase._id.toString(),
      guideId,
    );

    if (purchase.refunded || (refund && refund.refunded))
      return {
        hasAccess: false,
        isRefundable: false,
        isWithinRefundWindow,
        hasAccessedVideo,
        hasAccessedPdf,
        purchase,
      };

    return {
      hasAccess: true,
      isRefundable,
      isWithinRefundWindow,
      hasAccessedVideo,
      hasAccessedPdf,
      purchase,
    };
  }

  async updatePurchaseAccessInternal(purchaseId: string) {
    const purchase = await this.purchaseModel.findByIdAndUpdate(purchaseId, {
      $set: {
        pdfAccessed: true,
        pdfAccessedAt: new Date(),
        refundableUntil: null,
      },
    });

    if (!purchase) return null;
    return purchase;
  }

  async getSystemSettings(): Promise<SystemSettings> {
    const systemSettings = await this.systemSettingsModel.findOne({
      key: "main",
    });
    if (!systemSettings)
      throw new NotFoundException("System settings not found");
    return systemSettings;
  }

  ///
  /// ----------------------------- ADMIN FACING METHODS -----------------------------
  ///

  async togglePurchase(
    isPurchaseEnabled: boolean,
  ): Promise<SystemSettings | null> {
    const updatedSettings = await this.systemSettingsModel
      .findOneAndUpdate(
        { key: "main" },
        { $set: { isPurchaseEnabled } },
        { new: true, upsert: true },
      )
      .lean<SystemSettings>();

    if (!updatedSettings) {
      throw new InternalServerErrorException(
        "Failed to update system settings",
      );
    }

    return updatedSettings;
  }

  async seedSystemSettingsIfMissing(): Promise<SystemSettingsDocument> {
    const existingSettings = await this.systemSettingsModel.findOne({
      key: "main",
    });
    if (existingSettings) return existingSettings;

    return await this.systemSettingsModel.create({
      key: "main",
      isPurchaseEnabled: false,
    });
  }
}
