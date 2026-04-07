import { UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import type { AuthenticatedUser } from "../types/auth-user";

export function getUserId(req: Request): string {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.id) return authUser.id;

  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string")
    throw new UnauthorizedException("Missing user context");

  return userId;
}

export function getUserRole(req: Request): string {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.role) return authUser.role;

  const userRole = req.headers["x-user-role"];
  if (!userRole || typeof userRole !== "string")
    throw new UnauthorizedException("Missing user role");

  return userRole;
}

export function getOptionalUserId(req: Request): string | null {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.id) return authUser.id;

  const userId = req.headers["x-user-id"];
  return typeof userId === "string" ? userId : null;
}

export function getOptionalUserRole(req: Request): string | null {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.role) return authUser.role;

  const role = req.headers["x-user-role"];
  return typeof role === "string" ? role : null;
}
