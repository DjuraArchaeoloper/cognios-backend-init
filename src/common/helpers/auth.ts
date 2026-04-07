import { UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

export function getUserId(req: Request): string {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string")
    throw new UnauthorizedException("Missing user context");

  return userId;
}

export function getUserRole(req: Request): string {
  const userRole = req.headers["x-user-role"];
  if (!userRole || typeof userRole !== "string")
    throw new UnauthorizedException("Missing user role");

  return userRole;
}

export function getOptionalUserId(req: Request): string | null {
  const userId = req.headers["x-user-id"];
  return typeof userId === "string" ? userId : null;
}

export function getOptionalUserRole(req: Request): string | null {
  const role = req.headers["x-user-role"];
  return typeof role === "string" ? role : null;
}
