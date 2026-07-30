import { Role } from "@prisma/client";
import { PermissionAction } from "./auth.types";
import { rolePermissions } from "./permissionMatrix";

export function hasRolePermission(role: Role, action: PermissionAction): boolean {
  const allowedActions = rolePermissions[role];
  if (!allowedActions) return false;
  return allowedActions.includes(action);
}
