import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { PublicKey } from "@solana/web3.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Model, Types } from "mongoose";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Resend } from "resend";
import {
  AccountStatus,
  EmailVerifyTokenPayload,
  LearnerTokenPayload,
  MagicLinkTokenPayload,
  RoleName,
  SessionTokenPayload,
  SessionUserDto,
  WalletLinkTokenPayload,
} from "./auth.types";
import { User, UserDocument } from "./schemas/user.schema";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private readonly sessionCookieName = "cognios_session";
  private readonly sessionMaxAgeSec = 7 * 24 * 60 * 60;
  private readonly emailFrom =
    process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  private get authSecret(): string | null {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 16) return null;
    return secret;
  }

  private now(): Date {
    return new Date();
  }

  private parseObjectId(id: string): Types.ObjectId | null {
    try {
      return new Types.ObjectId(id.trim());
    } catch {
      return null;
    }
  }

  private encodePayload(data: object): string {
    return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  }

  private decodePayload<T>(payloadB64: string): T | null {
    try {
      return JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf8"),
      ) as T;
    } catch {
      return null;
    }
  }

  signToken(data: object, secret: string): string {
    const payload = this.encodePayload(data);
    const sig = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    return `${payload}.${sig}`;
  }

  verifyToken<T extends object>(token: string, secret: string): T | null {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!payloadB64 || !sig) return null;

    const expected = createHmac("sha256", secret).update(payloadB64).digest();
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, "base64url");
    } catch {
      return null;
    }
    if (sigBuf.length !== expected.length) return null;
    if (!timingSafeEqual(sigBuf, expected)) return null;

    const data = this.decodePayload<T>(payloadB64);
    if (!data || typeof (data as { exp?: unknown }).exp !== "number")
      return null;
    const now = Math.floor(Date.now() / 1000);
    if (now > (data as { exp: number }).exp) return null;
    return data;
  }

  buildSessionToken(
    userId: string,
    email: string | undefined,
    secret: string,
  ): string {
    const payload: SessionTokenPayload = {
      typ: "session",
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + this.sessionMaxAgeSec,
      ...(email ? { email } : {}),
    };
    return this.signToken(payload, secret);
  }

  readSessionToken(token: string, secret: string): SessionTokenPayload | null {
    const data = this.verifyToken<SessionTokenPayload>(token, secret);
    if (!data || data.typ !== "session" || !data.sub) return null;
    return data;
  }

  getSessionTokenFromCookieHeader(cookieHeader?: string): string | null {
    if (!cookieHeader) return null;
    for (const segment of cookieHeader.split(";")) {
      const trimmed = segment.trim();
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      if (k !== this.sessionCookieName) continue;
      const raw = trimmed.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return null;
  }

  sessionCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: this.sessionMaxAgeSec * 1000,
    };
  }

  getSecretOrNull(): string | null {
    return this.authSecret;
  }

  async findUserById(id: string): Promise<UserDocument | null> {
    const oid = this.parseObjectId(id);
    if (!oid) return null;
    return await this.userModel.findById(oid).exec();
  }

  toSessionUserDto(doc: UserDocument): SessionUserDto {
    return {
      id: String(doc._id),
      email: doc.email,
      emailVerified: doc.emailVerified,
      role: doc.role,
      username: doc.username,
      avatarUrl: doc.avatarUrl,
      bio: doc.bio,
      accountStatus: doc.accountStatus,
      walletAddress: doc.walletAddress,
      walletVerified: doc.walletVerified,
      onboardingCompleted: doc.onboardingCompleted,
      creatorAgreementAccepted: doc.creatorAgreementAccepted,
    };
  }

  async upsertCreatorFromMagicLink(email: string): Promise<UserDocument> {
    const normalized = email.toLowerCase().trim();
    const t = this.now();
    const existing = await this.userModel.findOne({ email: normalized }).exec();
    if (existing) {
      existing.emailVerified = true;
      existing.lastLoginAt = t;
      existing.updatedAt = t;
      existing.role = RoleName.CREATOR;
      if (!existing.accountStatus)
        existing.accountStatus = AccountStatus.ACTIVE;
      await existing.save();
      return existing;
    }
    return this.userModel.create({
      email: normalized,
      emailVerified: true,
      role: RoleName.CREATOR,
      walletVerified: false,
      onboardingCompleted: false,
      creatorAgreementAccepted: false,
      accountStatus: AccountStatus.ACTIVE,
      createdAt: t,
      updatedAt: t,
      lastLoginAt: t,
    });
  }

  async isWalletLinkedToCreator(walletAddress: string): Promise<boolean> {
    const doc = await this.userModel.findOne({ walletAddress }).exec();
    return doc?.role === RoleName.CREATOR;
  }

  async upsertLearnerWallet(
    walletAddress: string,
  ): Promise<
    { ok: true; user: UserDocument } | { ok: false; reason: "creator_wallet" }
  > {
    const t = this.now();
    const existing = await this.userModel.findOne({ walletAddress }).exec();
    if (existing) {
      if (existing.role === RoleName.CREATOR)
        return { ok: false, reason: "creator_wallet" };
      existing.lastSeenAt = t;
      existing.updatedAt = t;
      existing.role = RoleName.LEARNER;
      existing.walletVerified = true;
      await existing.save();
      return { ok: true, user: existing };
    }
    const created = await this.userModel.create({
      emailVerified: false,
      role: RoleName.LEARNER,
      walletAddress,
      walletVerified: true,
      onboardingCompleted: true,
      creatorAgreementAccepted: false,
      accountStatus: AccountStatus.ACTIVE,
      createdAt: t,
      updatedAt: t,
      lastSeenAt: t,
      lastLoginAt: t,
    });
    return { ok: true, user: created };
  }

  async linkWalletToUser(
    userId: string,
    walletAddress: string,
  ): Promise<{ ok: true } | { ok: false; reason: "in_use" | "not_found" }> {
    const oid = this.parseObjectId(userId);
    if (!oid) return { ok: false, reason: "not_found" };
    const other = await this.userModel
      .findOne({ walletAddress, _id: { $ne: oid } })
      .exec();
    if (other) return { ok: false, reason: "in_use" };
    const res = await this.userModel
      .updateOne(
        { _id: oid },
        {
          $set: {
            accountStatus: AccountStatus.ACTIVE,
            walletAddress,
            walletVerified: true,
            updatedAt: this.now(),
          },
        },
      )
      .exec();
    if (res.matchedCount === 0) return { ok: false, reason: "not_found" };
    return { ok: true };
  }

  private extractTokenFromMessage(message: string): string | null {
    const line = message
      .trim()
      .split("\n")
      .find((l) => l.startsWith("Token:"));
    if (!line) return null;
    return line.replace(/^Token:\s*/i, "").trim() || null;
  }

  verifySolanaSignature(
    messageUtf8: string,
    signatureBase58: string,
    walletAddress: string,
  ): boolean {
    try {
      const pubkey = new PublicKey(walletAddress);
      const signature = bs58.decode(signatureBase58);
      const messageBytes = new TextEncoder().encode(messageUtf8);
      return nacl.sign.detached.verify(
        messageBytes,
        signature,
        pubkey.toBytes(),
      );
    } catch {
      return false;
    }
  }

  buildWalletChallenge(userId: string, wallet: string, secret: string): string {
    const payload: WalletLinkTokenPayload = {
      typ: "wallet_link",
      sub: userId,
      wallet,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    };
    const token = this.signToken(payload, secret);
    return `Cognios: link creator wallet\nWallet: ${wallet}\nToken: ${token}`;
  }

  buildLearnerChallenge(wallet: string, secret: string): string {
    const payload: LearnerTokenPayload = {
      typ: "learner_wallet",
      wallet,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    };
    const token = this.signToken(payload, secret);
    return `Cognios: register learner wallet\nWallet: ${wallet}\nToken: ${token}`;
  }

  validatePublicKey(wallet: string): boolean {
    try {
      new PublicKey(wallet);
      return true;
    } catch {
      return false;
    }
  }

  validateWalletLinkToken(
    message: string,
    walletAddress: string,
    userId: string,
    secret: string,
  ): boolean {
    const embedded = this.extractTokenFromMessage(message);
    if (!embedded) return false;
    const payload = this.verifyToken<WalletLinkTokenPayload>(embedded, secret);
    const tokenSub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
    const tokenWallet =
      typeof payload?.wallet === "string" ? payload.wallet.trim() : "";
    return Boolean(
      payload &&
      payload.typ === "wallet_link" &&
      tokenSub === userId.trim() &&
      tokenWallet === walletAddress,
    );
  }

  validateLearnerToken(
    message: string,
    walletAddress: string,
    secret: string,
  ): boolean {
    const embedded = this.extractTokenFromMessage(message);
    if (!embedded) return false;
    const payload = this.verifyToken<LearnerTokenPayload>(embedded, secret);
    return Boolean(
      payload &&
      payload.typ === "learner_wallet" &&
      payload.wallet === walletAddress,
    );
  }

  async completeCreatorOnboarding(
    userId: string,
    input: { creatorAgreementAccepted: boolean; username: string },
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        reason: "not_found" | "validation" | "username_taken";
        message?: string;
      }
  > {
    const oid = this.parseObjectId(userId);
    if (!oid) return { ok: false, reason: "not_found" };
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
      return {
        ok: false,
        reason: "validation",
        message: "Invalid username format",
      };
    }
    const taken = await this.userModel
      .findOne({ username, _id: { $ne: oid } })
      .exec();
    if (taken)
      return {
        ok: false,
        reason: "username_taken",
        message: "Username is already taken",
      };
    const t = this.now();
    const res = await this.userModel
      .updateOne(
        { _id: oid, role: RoleName.CREATOR },
        {
          $set: {
            username,
            onboardingCompleted: true,
            onboardingCompletedAt: t,
            updatedAt: t,
            ...(input.creatorAgreementAccepted
              ? {
                  creatorAgreementAccepted: true,
                  creatorAgreementAcceptedAt: t,
                }
              : {}),
          },
        },
      )
      .exec();
    if (res.matchedCount === 0) return { ok: false, reason: "not_found" };
    return { ok: true };
  }

  async requestEmailVerificationForUser(
    userId: string,
    email: string,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: "already_verified" | "email_taken" | "not_found" }
  > {
    const oid = this.parseObjectId(userId);
    if (!oid) return { ok: false, reason: "not_found" };
    const user = await this.userModel.findById(oid).exec();
    if (!user) return { ok: false, reason: "not_found" };
    if (user.emailVerified && user.email?.toLowerCase().trim() === email) {
      return { ok: false, reason: "already_verified" };
    }
    const taken = await this.userModel
      .findOne({ email, _id: { $ne: oid } })
      .exec();
    if (taken) return { ok: false, reason: "email_taken" };
    return { ok: true };
  }

  async applyVerifiedEmailFromToken(
    userId: string,
    email: string,
  ): Promise<
    | { ok: true; user: UserDocument }
    | { ok: false; reason: "mismatch" | "email_taken" | "not_found" }
  > {
    const oid = this.parseObjectId(userId);
    if (!oid) return { ok: false, reason: "not_found" };
    const user = await this.userModel.findById(oid).exec();
    if (!user) return { ok: false, reason: "not_found" };
    const taken = await this.userModel
      .findOne({ email, _id: { $ne: oid } })
      .exec();
    if (taken) return { ok: false, reason: "email_taken" };
    user.email = email;
    user.emailVerified = true;
    user.updatedAt = this.now();
    await user.save();
    return { ok: true, user };
  }

  async sendMagicLink(
    email: string,
    verifyUrl: string,
  ): Promise<{ ok: true } | { ok: false }> {
    const apiKey = process.env.RESEND_API_KEY;
    console.log("API KEY", apiKey);
    if (!apiKey) return { ok: true };
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: this.emailFrom,
      to: email,
      subject: "Sign in to Cognios (creator)",
      html: `<p>Click to sign in:</p><p><a href="${verifyUrl}">Sign in to Cognios</a></p><p>This link expires in 15 minutes.</p>`,
    });
    console.log("ERROR", error);
    if (error) return { ok: false };
    return { ok: true };
  }

  async sendVerifyEmail(
    email: string,
    verifyUrl: string,
  ): Promise<{ ok: true } | { ok: false }> {
    console.log("ENTER");
    const apiKey = process.env.RESEND_API_KEY;
    console.log(apiKey);
    if (!apiKey) return { ok: true };
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: this.emailFrom,
      to: email,
      subject: "Verify your email · Cognios",
      html: `<p>Confirm this address for your Cognios account:</p><p><a href="${verifyUrl}">Verify email</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this message.</p>`,
    });
    if (error) return { ok: false };
    return { ok: true };
  }

  resolvePostAuthDestination(user: UserDocument): string {
    const complete =
      user.role === RoleName.CREATOR &&
      user.emailVerified === true &&
      user.walletVerified === true &&
      Boolean(user.walletAddress?.trim()) &&
      user.onboardingCompleted === true;
    return complete ? "/dashboard" : "/auth/creator/onboarding";
  }

  buildEmailVerifyToken(userId: string, email: string, secret: string): string {
    const payload: EmailVerifyTokenPayload = {
      typ: "email_verify",
      sub: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
    return this.signToken(payload, secret);
  }

  buildMagicToken(email: string, secret: string): string {
    const payload: MagicLinkTokenPayload = {
      typ: "magic_link",
      email,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
    };
    return this.signToken(payload, secret);
  }
}
