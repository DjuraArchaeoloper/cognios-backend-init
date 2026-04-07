import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { RoleType } from "../types";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const role = request.headers["x-user-role"];

    if (!role) throw new ForbiddenException("Admin access required");

    if (role !== RoleType.ADMIN && role !== RoleType.SUPERADMIN)
      throw new ForbiddenException("Unauthorized access");

    return true;
  }
}
