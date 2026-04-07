import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ServiceToServiceGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers["x-internal-secret"];

    const expectedSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_SECRET",
    );

    if (!secret || secret !== expectedSecret)
      throw new UnauthorizedException("Internal access only");

    return true;
  }
}
