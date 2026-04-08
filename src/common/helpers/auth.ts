import { Request } from "express";
import type { AuthenticatedUser } from "../types/auth-user";

export function getUserId(req: Request): string | null {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.id) return authUser.id;
  return null;
}

export function getUserRole(req: Request): string | null {
  const authUser = (req as Request & { authUser?: AuthenticatedUser }).authUser;
  if (authUser?.role) return authUser.role;
  return null;
}
