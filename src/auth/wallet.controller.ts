import { Body, Controller, Get, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import type { WalletLinkTokenPayload } from "./auth.types";

@Controller("wallet")
export class WalletController {
  constructor(private readonly authService: AuthService) {}

  private getSessionUserId(req: Request): string | null {
    const secret = this.authService.getSecretOrNull();
    if (!secret) return null;
    const raw = this.authService.getSessionTokenFromCookieHeader(req.headers.cookie);
    if (!raw) return null;
    const payload = this.authService.readSessionToken(raw, secret);
    return payload?.sub ?? null;
  }

  @Get("challenge")
  challenge(@Req() req: Request, @Query("wallet") wallet?: string) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) return { error: "Server misconfigured" };
    const userId = this.getSessionUserId(req);
    if (!userId) throw new UnauthorizedException("Unauthorized");
    const normalized = wallet?.trim() ?? "";
    if (!this.authService.validatePublicKey(normalized)) return { error: "Invalid wallet" };
    return { message: this.authService.buildWalletChallenge(userId, normalized, secret) };
  }

  @Post("link")
  async link(
    @Req() req: Request,
    @Body() body: { walletAddress?: string; message?: string; signature?: string }
  ) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) return { error: "Server misconfigured" };
    const userId = this.getSessionUserId(req);
    if (!userId) throw new UnauthorizedException("Unauthorized");
    const walletAddress =
      typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!this.authService.validatePublicKey(walletAddress)) return { error: "Invalid wallet" };
    if (!message || !signature) return { error: "Missing fields" };
    if (!this.authService.verifySolanaSignature(message, signature, walletAddress)) {
      return { error: "Invalid signature" };
    }
    if (!this.authService.validateWalletLinkToken(message, walletAddress, userId, secret)) {
      return { error: "Invalid or expired token" };
    }
    const result = await this.authService.linkWalletToUser(userId, walletAddress);
    if (!result.ok) {
      if (result.reason === "in_use") return { error: "Wallet already linked to another account" };
      return { error: "User not found" };
    }
    return { success: true };
  }
}
