export enum RoleName {
  LEARNER = "learner",
  CREATOR = "creator",
  ADMIN = "admin",
}

export enum AccountStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  BANNED = "banned",
  DEACTIVATED = "deactivated",
}

export interface SessionUserDto {
  id: string;
  email?: string;
  emailVerified: boolean;
  role: RoleName;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  accountStatus: AccountStatus;
  walletAddress?: string;
  walletVerified: boolean;
  onboardingCompleted: boolean;
  creatorAgreementAccepted: boolean;
}

export interface MagicLinkTokenPayload {
  typ: "magic_link";
  email: string;
  exp: number;
}

export interface SessionTokenPayload {
  typ: "session";
  sub: string;
  email?: string;
  exp: number;
}

export interface WalletLinkTokenPayload {
  typ: "wallet_link";
  sub: string;
  wallet: string;
  exp: number;
}

export interface LearnerTokenPayload {
  typ: "learner_wallet";
  wallet: string;
  exp: number;
}

export interface EmailVerifyTokenPayload {
  typ: "email_verify";
  sub: string;
  email: string;
  exp: number;
}
