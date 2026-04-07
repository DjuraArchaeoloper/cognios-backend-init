import {
  Controller,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Post,
  UseGuards,
  Request,
  Param,
} from "@nestjs/common";
import { PurchasesService } from "./purchases.service";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { getUserId } from "src/common/helpers/auth";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("billing/purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get("verify-purchase")
  @HttpCode(HttpStatus.OK)
  async verifyPurchaseBySession(
    @Query("session_id") sessionId: string,
    @Request() req,
  ) {
    if (!sessionId) throw new BadRequestException("No session provided");

    const userId = getUserId(req);

    const data = await this.purchasesService.verifyPurchaseBySession(
      sessionId,
      userId,
    );

    return {
      success: true,
      data,
    };
  }

  @Get("check-if-guide-purchased/:guideId")
  @HttpCode(HttpStatus.OK)
  async checkIfGuidePurchased(@Param("guideId") guideId: string) {
    if (!guideId) throw new BadRequestException("No guide provided");

    const data = await this.purchasesService.checkIfGuidePurchased(guideId);

    return {
      success: true,
      data,
    };
  }

  @Post("get-user-purchases")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getUserPurchases(@Request() req) {
    const userId = getUserId(req);
    if (!userId) throw new BadRequestException("No user provided");
    const purchases = await this.purchasesService.getUserPurchases(userId);

    return {
      success: true,
      data: purchases,
    };
  }

  @Post("creator-earnings")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getCreatorEarnings(@Request() req) {
    const creatorId = getUserId(req);

    if (!creatorId) throw new BadRequestException("No creator provided");

    const earnings = await this.purchasesService.getCreatorEarnings(creatorId);

    return {
      success: true,
      data: {
        creatorEarnings: earnings?.creatorEarnings,
        totalSales: earnings?.totalSales,
        totalEarnings: earnings?.totalEarnings,
        totalPrice: earnings?.totalPrice,
      },
    };
  }

  @Post("user-payments")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getUserPayments(@Request() req) {
    const userId = getUserId(req);

    if (!userId) throw new BadRequestException("No user provided");

    const payments = await this.purchasesService.getUserPayments(userId);

    return {
      success: true,
      data: {
        userPayments: payments?.userPayments,
        totalPayments: payments?.totalPayments,
      },
    };
  }

  @Post("video-playback-initiated")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async markVideoPlaybackInitiated(
    @Request() req,
    @Body() body: { guideId: string; videoPlaybackUrl: string },
  ) {
    const userId = getUserId(req);

    const result = await this.purchasesService.markVideoPlaybackInitiated(
      userId,
      body.guideId,
      body.videoPlaybackUrl,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post("eligible-for-refund")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getGuidesEligibleForRefund(@Request() req) {
    const userId = getUserId(req);
    if (!userId) throw new BadRequestException("No user provided");
    const guides =
      await this.purchasesService.getGuidesEligibleForRefund(userId);
    return { success: true, data: guides };
  }

  @UseGuards(InternalAuthGuard)
  @Get("system-settings")
  async getSystemSettings() {
    const result = await this.purchasesService.getSystemSettings();
    return { success: true, data: result };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @UseGuards(ServiceToServiceGuard)
  @Get("access/internal")
  @HttpCode(HttpStatus.OK)
  async getPurchaseAccessInternal(
    @Query("userId") userId: string,
    @Query("guideId") guideId: string,
  ) {
    if (!userId || !guideId)
      throw new BadRequestException("userId and guideId are required");

    const result = await this.purchasesService.getPurchaseAccessInternal(
      userId,
      guideId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @UseGuards(ServiceToServiceGuard)
  @Post("update-access/internal")
  @HttpCode(HttpStatus.OK)
  async updatePurchaseAccessInternal(@Body() body: { purchaseId: string }) {
    if (!body.purchaseId)
      throw new BadRequestException("purchaseId is required");

    const result = await this.purchasesService.updatePurchaseAccessInternal(
      body.purchaseId,
    );

    return {
      success: true,
      data: result,
    };
  }
}
