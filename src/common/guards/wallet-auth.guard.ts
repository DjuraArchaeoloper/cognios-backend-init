import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../types/auth-user";

@Injectable()
export class WalletAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.authUser as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException("Unauthorized");
    if (!user.walletVerified || !user.walletAddress) {
      throw new ForbiddenException("Wallet must be verified");
    }
    return true;
  }
}
