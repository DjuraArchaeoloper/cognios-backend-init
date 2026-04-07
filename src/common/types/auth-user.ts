import { RoleName } from "src/auth/auth.types";

export interface AuthenticatedUser {
  id: string;
  role: RoleName;
  emailVerified: boolean;
  walletVerified: boolean;
  walletAddress?: string;
}
