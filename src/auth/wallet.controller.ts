import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";

@Controller("wallet")
export class WalletController {
  constructor(private readonly authService: AuthService) {}

  private getSessionUserId(req: Request): string | null {
    const secret = this.authService.getSecretOrNull();
    if (!secret) return null;
    const raw = this.authService.getSessionTokenFromCookieHeader(
      req.headers.cookie,
    );
    if (!raw) return null;
    const payload = this.authService.readSessionToken(raw, secret);
    return payload?.sub ?? null;
  }

  @Get("challenge")
  challenge(@Req() req: Request, @Query("wallet") wallet?: string) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new InternalServerErrorException("Server misconfigured");
    const userId = this.getSessionUserId(req);
    if (!userId) throw new UnauthorizedException("Unauthorized");
    const normalized = wallet?.trim() ?? "";
    if (!this.authService.validatePublicKey(normalized)) {
      throw new BadRequestException("Invalid wallet");
    }
    return {
      message: this.authService.buildWalletChallenge(
        userId,
        normalized,
        secret,
      ),
    };
  }

  @Post("link")
  async link(
    @Req() req: Request,
    @Body()
    body: { walletAddress?: string; message?: string; signature?: string },
  ) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new InternalServerErrorException("Server misconfigured");
    const userId = this.getSessionUserId(req);
    if (!userId) throw new UnauthorizedException("Unauthorized");
    const walletAddress =
      typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";
    const signature =
      typeof body.signature === "string" ? body.signature.trim() : "";
    if (!this.authService.validatePublicKey(walletAddress)) {
      throw new BadRequestException("Invalid wallet");
    }
    if (!message || !signature) throw new BadRequestException("Missing fields");
    if (
      !this.authService.verifySolanaSignature(message, signature, walletAddress)
    ) {
      throw new BadRequestException("Invalid signature");
    }
    if (
      !this.authService.validateWalletLinkToken(
        message,
        walletAddress,
        userId,
        secret,
      )
    ) {
      throw new BadRequestException("Invalid or expired token");
    }
    const result = await this.authService.linkWalletToUser(
      userId,
      walletAddress,
    );
    if (!result.ok) {
      if (result.reason === "in_use") {
        throw new ConflictException("Wallet already linked to another account");
      }
      throw new NotFoundException("User not found");
    }
    return { success: true };
  }
}
