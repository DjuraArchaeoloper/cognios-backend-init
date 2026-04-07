import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import type {
  EmailVerifyTokenPayload,
  MagicLinkTokenPayload,
} from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private appBase(req: Request): string {
    return `${req.protocol}://${req.get("host")}`;
  }

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

  @Post("request-link")
  async requestLink(@Req() req: Request, @Body() body: { email?: string }) {
    const secret = this.authService.getSecretOrNull();
    if (!secret)
      throw new InternalServerErrorException("AUTH_SECRET is not configured");
    const email =
      typeof body.email === "string" ? body.email.toLowerCase().trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Invalid email");
    }
    const token = this.authService.buildMagicToken(email, secret);
    const verifyUrl = `${this.appBase(req)}/auth/verify?token=${encodeURIComponent(token)}`;
    const sent = await this.authService.sendMagicLink(email, verifyUrl);
    if (!sent.ok)
      throw new InternalServerErrorException("Failed to send email");
    return {
      success: true,
      devLink: process.env.NODE_ENV !== "production" ? verifyUrl : undefined,
    };
  }

  @Get("verify")
  async verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") token?: string,
  ) {
    const frontend =
      process.env.FRONTEND_URL?.replace(/\/$/, "") ?? this.appBase(req);
    const secret = this.authService.getSecretOrNull();
    if (!secret || !token)
      return res.redirect(`${frontend}/auth/creator/login?error=missing_token`);
    const data = this.authService.verifyToken<MagicLinkTokenPayload>(
      token,
      secret,
    );
    if (!data || data.typ !== "magic_link" || !data.email) {
      return res.redirect(`${frontend}/auth/creator/login?error=invalid_token`);
    }
    const user = await this.authService.upsertCreatorFromMagicLink(data.email);
    const sessionToken = this.authService.buildSessionToken(
      String(user._id),
      user.email,
      secret,
    );
    res.cookie(
      "cognios_session",
      sessionToken,
      this.authService.sessionCookieOptions(),
    );
    const nextPath = this.authService.resolvePostAuthDestination(user);
    return res.redirect(`${frontend}${nextPath}`);
  }

  @Get("me")
  async me(@Req() req: Request) {
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
    return this.authService.toSessionUserDto(user);
  }

  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
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
    const next = this.authService.buildSessionToken(
      String(user._id),
      user.email,
      secret,
    );
    res.cookie(
      "cognios_session",
      next,
      this.authService.sessionCookieOptions(),
    );
    return { success: true };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("cognios_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return { success: true };
  }

  @Get("wallet-learner-eligibility")
  async learnerEligibility(@Query("wallet") wallet?: string) {
    const normalized = wallet?.trim() ?? "";
    if (!this.authService.validatePublicKey(normalized)) {
      throw new BadRequestException("Invalid wallet");
    }
    const blocked = await this.authService.isWalletLinkedToCreator(normalized);
    return { allowed: !blocked };
  }

  @Get("learner-challenge")
  async learnerChallenge(@Query("wallet") wallet?: string) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new InternalServerErrorException("Server misconfigured");
    const normalized = wallet?.trim() ?? "";
    if (!this.authService.validatePublicKey(normalized)) {
      throw new BadRequestException("Invalid wallet");
    }
    if (await this.authService.isWalletLinkedToCreator(normalized)) {
      throw new ForbiddenException(
        "This wallet is linked to a creator account. Sign in with your creator email link instead.",
      );
    }
    return {
      message: this.authService.buildLearnerChallenge(normalized, secret),
    };
  }

  @Post("learner-upsert")
  async learnerUpsert(
    @Req() _req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body()
    body: { walletAddress?: string; message?: string; signature?: string },
  ) {
    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new InternalServerErrorException("Server misconfigured");
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
      !this.authService.validateLearnerToken(message, walletAddress, secret)
    ) {
      throw new BadRequestException("Invalid or expired token");
    }
    const result = await this.authService.upsertLearnerWallet(walletAddress);
    if (!result.ok) {
      throw new ForbiddenException(
        "This wallet is linked to a creator account. Sign in with your creator email link instead.",
      );
    }
    const sessionToken = this.authService.buildSessionToken(
      String(result.user._id),
      result.user.email,
      secret,
    );
    res.cookie(
      "cognios_session",
      sessionToken,
      this.authService.sessionCookieOptions(),
    );
    return { success: true };
  }

  @Post("request-email-verification")
  async requestEmailVerification(
    @Req() req: Request,
    @Body() body: { email?: string },
  ) {
    const secret = this.authService.getSecretOrNull();
    if (!secret)
      throw new InternalServerErrorException("AUTH_SECRET is not configured");
    const userId = this.getSessionUserId(req);
    if (!userId) throw new UnauthorizedException("Unauthorized");
    const email =
      typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Invalid email");
    }
    const reserved = await this.authService.requestEmailVerificationForUser(
      userId,
      email,
    );
    if (!reserved.ok) {
      if (reserved.reason === "already_verified") {
        throw new BadRequestException("Your email is already verified");
      }
      if (reserved.reason === "email_taken") {
        throw new ConflictException("That email is already in use");
      }
      throw new NotFoundException("Account not found");
    }
    const token = this.authService.buildEmailVerifyToken(userId, email, secret);
    const verifyUrl = `${this.appBase(req)}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const sent = await this.authService.sendVerifyEmail(email, verifyUrl);
    if (!sent.ok)
      throw new InternalServerErrorException("Failed to send email");
    return {
      success: true,
      devLink: process.env.NODE_ENV !== "production" ? verifyUrl : undefined,
    };
  }

  @Get("verify-email")
  async verifyEmail(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("token") token?: string,
  ) {
    const secret = this.authService.getSecretOrNull();
    const frontend =
      process.env.FRONTEND_URL?.replace(/\/$/, "") ?? this.appBase(req);
    const redirectWith = (query: Record<string, string>) => {
      const qs = new URLSearchParams({ tab: "profile", ...query });
      return res.redirect(
        `${frontend}/dashboard/user-settings?${qs.toString()}`,
      );
    };
    if (!secret || !token)
      return redirectWith({ email_error: "missing_token" });
    const data = this.authService.verifyToken<EmailVerifyTokenPayload>(
      token,
      secret,
    );
    if (!data || data.typ !== "email_verify" || !data.sub || !data.email) {
      return redirectWith({ email_error: "invalid_token" });
    }
    const result = await this.authService.applyVerifiedEmailFromToken(
      data.sub,
      data.email.toLowerCase().trim(),
    );
    if (!result.ok) {
      const code =
        result.reason === "mismatch"
          ? "expired_or_changed"
          : result.reason === "email_taken"
            ? "email_taken"
            : "not_found";
      return redirectWith({ email_error: code });
    }
    const sessionToken = this.authService.buildSessionToken(
      String(result.user._id),
      result.user.email,
      secret,
    );
    res.cookie(
      "cognios_session",
      sessionToken,
      this.authService.sessionCookieOptions(),
    );
    return redirectWith({ email_verified: "1" });
  }
}
