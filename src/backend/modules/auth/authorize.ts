import { Role } from "@prisma/client";
import { UserSession, PermissionAction, AuthzContext } from "./auth.types";
import { hasRolePermission } from "./permissions";

export function canPerform(
  user: UserSession,
  action: PermissionAction,
  context?: AuthzContext
): boolean {
  const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId);
  if (!activeMembership) return false;

  const role = activeMembership.role;

  // Platform Super Admins bypass all organization checks for administrative roles
  if (role === Role.PLATFORM_SUPER_ADMIN) return true;

  // 1. Role Check: Check if the role is allowed to perform this action in general
  if (!hasRolePermission(role, action)) {
    return false;
  }

  // 2. Context & Org isolation checks
  switch (action) {
    case "create_ticket":
      return true; // Simple RBAC check passed

    case "read_ticket":
      if (!context?.ticketOwnerOrgId) {
        console.log(`[DEBUG_AUTHZ_READ] context.ticketOwnerOrgId is missing!`);
        return false;
      }
      const isOwner = context.ticketOwnerOrgId === user.activeOrgId;
      const isShared = !!context.isTicketSharedWithActiveOrg;
      return isOwner || isShared;

    case "comment_ticket":
      if (!context?.ticketOwnerOrgId) return false;
      const canRead = (context.ticketOwnerOrgId === user.activeOrgId) || !!context.isTicketSharedWithActiveOrg;
      return canRead;

    case "edit_ticket":
      if (!context?.ticketOwnerOrgId) return false;
      return context.ticketOwnerOrgId === user.activeOrgId;

    case "delete_ticket":
      if (!context?.ticketOwnerOrgId) return false;
      return context.ticketOwnerOrgId === user.activeOrgId;

    case "share_ticket":
      if (!context?.ticketOwnerOrgId) return false;
      return context.ticketOwnerOrgId === user.activeOrgId;

    case "manage_feature_flags":
      return true; // Simple RBAC check passed

    case "create_pr":
      return true; // Simple RBAC check passed

    case "read_pr":
      if (!context?.prOwnerOrgId) return false;
      return (
        context.prOwnerOrgId === user.activeOrgId ||
        !!context.isPrSharedWithActiveOrg
      );

    case "edit_pr":
      if (!context?.prOwnerOrgId) return false;
      return (
        context.prOwnerOrgId === user.activeOrgId &&
        (role === Role.ORG_ADMIN || context.prAuthorId === user.id)
      );

    case "assign_reviewer":
      if (!context?.prOwnerOrgId) return false;
      return (
        context.prOwnerOrgId === user.activeOrgId &&
        (role === Role.ORG_ADMIN || context.prAuthorId === user.id)
      );

    case "submit_decision":
      return true; // Simple RBAC check passed

    case "merge_pr":
      if (!context?.prOwnerOrgId) return false;
      return context.prOwnerOrgId === user.activeOrgId;

    case "share_pr":
      if (!context?.prOwnerOrgId) return false;
      return (
        context.prOwnerOrgId === user.activeOrgId &&
        (role === Role.ORG_ADMIN || context.prAuthorId === user.id)
      );

    case "view_audit_logs":
      return true; // Simple RBAC check passed

    default:
      return false;
  }
}
