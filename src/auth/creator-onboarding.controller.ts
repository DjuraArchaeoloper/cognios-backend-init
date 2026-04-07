import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { RoleName } from "./auth.types";

@Controller("creator/onboarding")
export class CreatorOnboardingController {
  constructor(private readonly authService: AuthService) {}

  @Post("complete")
  async complete(
    @Req() req: Request,
    @Body() body: { creatorAgreementAccepted?: boolean; username?: string },
  ) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new UnauthorizedException("Unauthorized");
    const raw = this.authService.getSessionTokenFromCookieHeader(
      req.headers.cookie,
    );
    if (!raw) throw new UnauthorizedException("Unauthorized");
    const payload = this.authService.readSessionToken(raw, secret);
    if (!payload) throw new UnauthorizedException("Unauthorized");
    const user = await this.authService.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException("Unauthorized");
    if (user.role !== RoleName.CREATOR)
      throw new ForbiddenException("Forbidden");
    if (!user.walletVerified || !user.walletAddress) {
      throw new BadRequestException("Wallet must be linked first");
    }
    if (body.creatorAgreementAccepted !== true) {
      throw new BadRequestException("Creator agreement must be accepted");
    }
    const username = typeof body.username === "string" ? body.username : "";
    const result = await this.authService.completeCreatorOnboarding(
      String(user._id),
      {
        creatorAgreementAccepted: true,
        username,
      },
    );
    if (!result.ok)
      throw new BadRequestException(result.message ?? "Could not update user");
    return { success: true };
  }
}
