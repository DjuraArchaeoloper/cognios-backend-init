import { RoleName } from "./auth.types";

export interface PublicUserDto {
  id: string;
  email?: string;
  emailVerified: boolean;
  role: RoleName;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  accountStatus: string;
  walletAddress?: string;
  walletVerified: boolean;
  onboardingCompleted: boolean;
  creatorAgreementAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
