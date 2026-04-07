import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { RoleName } from "src/auth/auth.types";
import type { AuthenticatedUser } from "../types/auth-user";

@Injectable()
export class CreatorEmailWalletGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.authUser as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException("Unauthorized");
    if (user.role !== RoleName.CREATOR) {
      throw new ForbiddenException("Creator access required");
    }
    if (!user.emailVerified || !user.walletVerified || !user.walletAddress) {
      throw new ForbiddenException("Creator email and wallet must be verified");
    }
    return true;
  }
}
