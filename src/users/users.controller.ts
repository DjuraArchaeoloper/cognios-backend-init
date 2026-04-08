import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import type { AuthenticatedUser } from "src/common/types/auth-user";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(InternalAuthGuard)
  async getCurrentUser(@CurrentUser() user?: AuthenticatedUser) {
    if (!user?.id) throw new BadRequestException("No user provided");

    const data = await this.usersService.getUserById(user.id);
    if (!data) throw new NotFoundException("User not found");

    return {
      success: true,
      data,
    };
  }

  @Get(":id")
  @UseGuards(InternalAuthGuard)
  async getUserById(@Param("id") id: string) {
    const data = await this.usersService.getUserById(id);
    if (!data) throw new NotFoundException("User not found");

    return {
      success: true,
      data,
    };
  }
}
