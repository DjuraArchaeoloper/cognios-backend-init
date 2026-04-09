import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RoleName } from "src/auth/types/auth.types";
import { AuthService } from "src/auth/auth.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
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
    if (user.role !== RoleName.ADMIN) throw new ForbiddenException("Forbidden");
    return true;
  }
}
