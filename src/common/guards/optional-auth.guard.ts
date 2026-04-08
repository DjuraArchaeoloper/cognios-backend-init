import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "src/auth/auth.service";
import type { AuthenticatedUser } from "../types/auth-user";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const secret = this.authService.getSecretOrNull();
    if (!secret) return true;

    const raw = this.authService.getSessionTokenFromCookieHeader(
      req.headers.cookie,
    );
    if (!raw) return true;

    const payload = this.authService.readSessionToken(raw, secret);
    if (!payload?.sub) return true;

    const user = await this.authService.findUserById(payload.sub);
    if (!user) return true;

    const dto = this.authService.toSessionUserDto(user);
    req.authUser = {
      id: dto.id,
      role: dto.role,
      emailVerified: dto.emailVerified,
      walletVerified: dto.walletVerified,
      walletAddress: dto.walletAddress,
    } satisfies AuthenticatedUser;

    return true;
  }
}
