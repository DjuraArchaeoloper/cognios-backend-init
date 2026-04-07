import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RoleName } from "src/auth/auth.types";
import { AuthService } from "src/auth/auth.service";
import type { AuthenticatedUser } from "../types/auth-user";

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headerUserId = req.headers["x-user-id"];
    const headerRole = req.headers["x-user-role"];

    // Preserve existing internal service-to-service behavior.
    if (typeof headerUserId === "string" && headerUserId.trim()) {
      const roleFromHeader =
        typeof headerRole === "string" && headerRole.trim()
          ? (headerRole as RoleName)
          : RoleName.LEARNER;
      req.authUser = {
        id: headerUserId,
        role: roleFromHeader,
        emailVerified: true,
        walletVerified: true,
      } satisfies AuthenticatedUser;
      return true;
    }

    const secret = this.authService.getSecretOrNull();
    if (!secret) throw new UnauthorizedException("Unauthorized");

    const raw = this.authService.getSessionTokenFromCookieHeader(
      req.headers.cookie,
    );
    if (!raw) throw new UnauthorizedException("Unauthorized");

    const payload = this.authService.readSessionToken(raw, secret);
    if (!payload?.sub) throw new UnauthorizedException("Unauthorized");

    const user = await this.authService.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException("Unauthorized");

    const dto = this.authService.toSessionUserDto(user);
    req.authUser = {
      id: dto.id,
      role: dto.role,
      emailVerified: dto.emailVerified,
      walletVerified: dto.walletVerified,
      walletAddress: dto.walletAddress,
    } satisfies AuthenticatedUser;

    // Backward compatibility for existing helper/getUserId/getUserRole paths.
    req.headers["x-user-id"] = dto.id;
    req.headers["x-user-role"] = dto.role;

    return true;
  }
}
