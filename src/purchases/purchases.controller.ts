import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { PurchasesService } from "./purchases.service";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { getUserId } from "src/common/helpers/auth";
import type { AuthenticatedUser } from "src/common/types/auth-user";
import type { Request as ExpressRequest } from "express";

@Controller("purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get("metadata/:projectId/:userId.json")
  @HttpCode(HttpStatus.OK)
  async getProjectNftMetadata(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
  ) {
    const data = await this.purchasesService.getProjectNftMetadata(
      projectId,
      userId,
    );
    return data;
  }

  @Post("prepare")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async preparePurchase(
    @Body() body: { projectId: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const buyerWalletAddress = req.authUser?.walletAddress;

    if (!userId) throw new BadRequestException("No user provided");
    if (!buyerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.projectId) throw new BadRequestException("projectId is required");

    const data = await this.purchasesService.preparePurchase({
      userId,
      projectId: body.projectId,
      buyerWalletAddress,
    });

    return { success: true, data };
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async confirmPurchase(
    @Body()
    body: { projectId: string; txSignature: string; expectedMint: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const buyerWalletAddress = req.authUser?.walletAddress;

    if (!userId) throw new BadRequestException("No user provided");
    if (!buyerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.projectId) throw new BadRequestException("projectId is required");
    if (!body.txSignature)
      throw new BadRequestException("txSignature is required");
    if (!body.expectedMint)
      throw new BadRequestException("expectedMint is required");

    const data = await this.purchasesService.confirmPurchase({
      userId,
      projectId: body.projectId,
      buyerWalletAddress,
      txSignature: body.txSignature,
      expectedMint: body.expectedMint,
    });

    return { success: true, data };
  }

  @Post("marketplace/list/prepare")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async prepareMarketplaceList(
    @Body() body: { projectId: string; priceLamports: number },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const sellerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!sellerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.projectId || !body.priceLamports)
      throw new BadRequestException("projectId and priceLamports are required");

    const data = await this.purchasesService.prepareMarketplaceList({
      userId,
      projectId: body.projectId,
      sellerWalletAddress,
      priceLamports: body.priceLamports,
    });
    return { success: true, data };
  }

  @Get("marketplace/list/eligibility/:projectId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async getMarketplaceListingEligibility(
    @Param("projectId") projectId: string,
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const sellerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!sellerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!projectId) throw new BadRequestException("projectId is required");

    const data = await this.purchasesService.getMarketplaceListingEligibility({
      projectId,
      sellerWalletAddress,
    });
    return { success: true, data };
  }

  @Post("marketplace/list/confirm")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async confirmMarketplaceList(
    @Body() body: { listingId: string; txSignature: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const sellerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!sellerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.listingId || !body.txSignature)
      throw new BadRequestException("listingId and txSignature are required");

    const data = await this.purchasesService.confirmMarketplaceList({
      userId,
      listingId: body.listingId,
      sellerWalletAddress,
      txSignature: body.txSignature,
    });
    return { success: true, data };
  }

  @Post("marketplace/delist/prepare")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async prepareMarketplaceDelist(
    @Body() body: { listingId: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const sellerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!sellerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.listingId) throw new BadRequestException("listingId is required");

    const data = await this.purchasesService.prepareMarketplaceDelist({
      userId,
      listingId: body.listingId,
      sellerWalletAddress,
    });
    return { success: true, data };
  }

  @Post("marketplace/delist/confirm")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async confirmMarketplaceDelist(
    @Body() body: { listingId: string; txSignature: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const sellerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!sellerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.listingId || !body.txSignature)
      throw new BadRequestException("listingId and txSignature are required");

    const data = await this.purchasesService.confirmMarketplaceDelist({
      userId,
      listingId: body.listingId,
      sellerWalletAddress,
      txSignature: body.txSignature,
    });
    return { success: true, data };
  }

  @Post("marketplace/buy/prepare")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async prepareMarketplaceBuy(
    @Body() body: { listingId: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const buyerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!buyerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.listingId) throw new BadRequestException("listingId is required");

    const data = await this.purchasesService.prepareMarketplaceBuy({
      userId,
      listingId: body.listingId,
      buyerWalletAddress,
    });
    return { success: true, data };
  }

  @Post("marketplace/buy/confirm")
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalAuthGuard)
  async confirmMarketplaceBuy(
    @Body() body: { listingId: string; txSignature: string },
    @Request() req: ExpressRequest & { authUser?: AuthenticatedUser },
  ) {
    const userId = getUserId(req);
    const buyerWalletAddress = req.authUser?.walletAddress;
    if (!userId) throw new BadRequestException("No user provided");
    if (!buyerWalletAddress)
      throw new BadRequestException("Wallet not linked on profile");
    if (!body.listingId || !body.txSignature)
      throw new BadRequestException("listingId and txSignature are required");

    const data = await this.purchasesService.confirmMarketplaceBuy({
      userId,
      listingId: body.listingId,
      txSignature: body.txSignature,
      buyerWalletAddress,
    });
    return { success: true, data };
  }

  @Get("marketplace/listings")
  @HttpCode(HttpStatus.OK)
  async getMarketplaceListings(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("mint") mint?: string,
    @Query("projectId") projectId?: string,
  ) {
    const data = await this.purchasesService.getMarketplaceListings({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as any,
      mint,
      projectId,
    });
    return { success: true, ...data };
  }

  @Get("marketplace/listings/project/:projectId")
  @HttpCode(HttpStatus.OK)
  async getMarketplaceProjectListings(
    @Param("projectId") projectId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const data = await this.purchasesService.getMarketplaceListings({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: "active" as any,
      projectId,
    });
    return { success: true, ...data };
  }

  @Post("marketplace/reconcile")
  @HttpCode(HttpStatus.OK)
  async reconcileMarketplaceListings() {
    const data = await this.purchasesService.reconcileMarketplaceListings();
    return { success: true, data };
  }

  // @Post("get-user-purchases")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(InternalAuthGuard)
  // async getUserPurchases(@Request() req) {
  //   const userId = getUserId(req);
  //   if (!userId) throw new BadRequestException("No user provided");
  //   const purchases = await this.purchasesService.getUserPurchases(userId);

  //   return {
  //     success: true,
  //     data: purchases,
  //   };
  // }

  // @Post("creator-earnings")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(InternalAuthGuard)
  // async getCreatorEarnings(@Request() req) {
  //   const creatorId = getUserId(req);

  //   if (!creatorId) throw new BadRequestException("No creator provided");

  //   const earnings = await this.purchasesService.getCreatorEarnings(creatorId);

  //   return {
  //     success: true,
  //     data: {
  //       creatorEarnings: earnings?.creatorEarnings,
  //       totalSales: earnings?.totalSales,
  //       totalEarnings: earnings?.totalEarnings,
  //       totalPrice: earnings?.totalPrice,
  //     },
  //   };
  // }

  // @Post("user-payments")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(InternalAuthGuard)
  // async getUserPayments(@Request() req) {
  //   const userId = getUserId(req);

  //   if (!userId) throw new BadRequestException("No user provided");

  //   const payments = await this.purchasesService.getUserPayments(userId);

  //   return {
  //     success: true,
  //     data: {
  //       userPayments: payments?.userPayments,
  //       totalPayments: payments?.totalPayments,
  //     },
  //   };
  // }

  // ///
  // /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  // ///

  // @Get("access/internal")
  // @HttpCode(HttpStatus.OK)
  // async getPurchaseAccessInternal(
  //   @Query("userId") userId: string,
  //   @Query("projectId") projectId: string,
  // ) {
  //   if (!userId || !projectId)
  //     throw new BadRequestException("userId and projectId are required");

  //   const result = await this.purchasesService.getPurchaseAccessInternal(
  //     userId,
  //     projectId,
  //   );

  //   return {
  //     success: true,
  //     data: result,
  //   };
  // }
}
