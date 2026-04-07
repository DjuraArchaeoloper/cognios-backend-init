import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../types/auth-user";
import { RoleName } from "src/auth/auth.types";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authUser = request.authUser as AuthenticatedUser | undefined;
    const headerRole = request.headers["x-user-role"];
    const role =
      authUser?.role ??
      (typeof headerRole === "string" ? (headerRole as RoleName) : undefined);

    if (!role) throw new ForbiddenException("Admin access required");

    if (role !== RoleName.ADMIN)
      throw new ForbiddenException("Unauthorized access");

    return true;
  }
}
