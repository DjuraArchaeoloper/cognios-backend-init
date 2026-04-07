import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { Refund, RefundDocument } from "./schemas/refund.schema";
import { HttpService } from "@nestjs/axios";
import { PurchasesService } from "src/purchases/purchases.service";
import { EmailService } from "./email.service";
import { firstValueFrom } from "rxjs";
import { SupportRequestStatus } from "./types/refund";

@Injectable()
export class RefundsService {
  private readonly authServiceUrl: string;

  constructor(
    @InjectModel(Refund.name)
    private refundModel: Model<RefundDocument>,

    private configService: ConfigService,
    private httpService: HttpService,
    @Inject(forwardRef(() => PurchasesService))
    private purchasesService: PurchasesService,
    private emailService: EmailService,
  ) {
    this.authServiceUrl =
      this.configService.get<string>("AUTH_SERVICE_URL") || "";
  }

  ///
  /// ----------------------------- ADMIN FACING METHODS -----------------------------
  ///

  async updateSupportRequest(
    requestId: string,
    status: SupportRequestStatus,
  ): Promise<{
    success: boolean;
  } | null> {
    if (!this.authServiceUrl)
      throw new Error("AUTH_SERVICE_URL not configured");

    const internalSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.authServiceUrl}/admin/support/request/${requestId}/resolve/internal`,
        { status },
        {
          headers: {
            "x-internal-secret": internalSecret,
          },
        },
      ),
    );

    if (response.data?.success && response.data?.data) {
      return { success: true };
    } else throw new Error(`Failed to update support request ${requestId}`);
  }

  async approveRefund(
    userId: string,
    guideId: string,
    refundId: string,
    adminMessage: string,
  ): Promise<{
    success: boolean;
    refund: RefundDocument;
  }> {
    const purchase = await this.purchasesService.getPurchaseAccessInternal(
      userId,
      guideId,
    );
    if (!purchase || !purchase.purchase)
      throw new NotFoundException("Purchase not found");

    if (!purchase.isRefundable)
      throw new BadRequestException(
        `This purchase is not refundable because ${purchase.isWithinRefundWindow && "the 7-day refund window has expired"} ${purchase.hasAccessedVideo ? "the video has been accessed" : ""} ${purchase.hasAccessedPdf ? "the PDF has been accessed" : ""}`,
      );

    if (purchase.purchase?.refunded)
      throw new BadRequestException("This purchase has already been refunded");

    const existingRefund = await this.refundModel.findOne({
      userId,
      guideId,
      supportRequestId: refundId,
    });

    if (existingRefund)
      throw new BadRequestException("This refund has already been requested");

    try {
      const updatedPurchase =
        await this.purchasesService.updatePurchaseRefunded(
          purchase.purchase?._id,
          "Customer requested refund",
        );

      if (!updatedPurchase)
        throw new BadRequestException("Failed to update purchase");

      const newRefund = await this.refundModel.create({
        userId: new Types.ObjectId(userId),
        guideId: new Types.ObjectId(guideId),
        supportRequestId: new Types.ObjectId(refundId),
        purchaseId: new Types.ObjectId(purchase.purchase?._id),
        adminMessage,
        refunded: true,
      });

      await this.updateSupportRequest(refundId, SupportRequestStatus.ACCEPTED);

      const user = await this.purchasesService.fetchUserData(userId);

      if (!user || !user.profileInfo?.email) {
        return { success: true, refund: newRefund };
      }

      await this.emailService.sendRefundRequestEmail(user.profileInfo?.email);

      return { success: true, refund: newRefund };
    } catch (error: any) {
      console.log("error", error);
      throw new BadRequestException(
        `Failed to process refund: ${error.message || "Unknown error"}`,
      );
    }
  }

  async getRefundByPurchaseAndGuideId(
    purchaseId: string,
    guideId: string,
  ): Promise<RefundDocument | null> {
    return await this.refundModel.findOne({
      purchaseId: new Types.ObjectId(purchaseId),
      guideId: new Types.ObjectId(guideId),
    });
  }
}
