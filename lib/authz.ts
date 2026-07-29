import { Role } from "@prisma/client";

export type PermissionAction =
  | "create_ticket"
  | "read_ticket"
  | "edit_ticket"
  | "delete_ticket"
  | "comment_ticket"
  | "share_ticket"
  | "manage_feature_flags";

interface UserSession {
  id: string;
  activeOrgId: string;
  memberships: {
    orgId: string;
    orgName: string;
    role: Role;
  }[];
}

interface AuthzContext {
  ticketOwnerOrgId?: string;
  isTicketSharedWithActiveOrg?: boolean;
}

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

  switch (action) {
    case "create_ticket":
      // Allowed for ORG_ADMIN or SUPPORT_AGENT in their active organization
      return role === Role.ORG_ADMIN || role === Role.SUPPORT_AGENT;

    case "read_ticket":
      // Can read if active org is the owner, or if the ticket is shared with their active org
      if (!context?.ticketOwnerOrgId) {
        console.log(`[DEBUG_AUTHZ_READ] context.ticketOwnerOrgId is missing!`);
        return false;
      }
      const isOwner = context.ticketOwnerOrgId === user.activeOrgId;
      const isShared = !!context.isTicketSharedWithActiveOrg;
      return isOwner || isShared;

    case "comment_ticket":
      // Allowed for anyone who has read access to the ticket
      if (!context?.ticketOwnerOrgId) return false;
      const canRead = (context.ticketOwnerOrgId === user.activeOrgId) || !!context.isTicketSharedWithActiveOrg;
      return canRead;

    case "edit_ticket":
      // Only owner org's ORG_ADMIN or SUPPORT_AGENT can edit
      if (!context?.ticketOwnerOrgId) return false;
      return (
        context.ticketOwnerOrgId === user.activeOrgId &&
        (role === Role.ORG_ADMIN || role === Role.SUPPORT_AGENT)
      );

    case "delete_ticket":
      // Restrict to ORG_ADMIN of the owner organization
      if (!context?.ticketOwnerOrgId) return false;
      return (
        context.ticketOwnerOrgId === user.activeOrgId &&
        role === Role.ORG_ADMIN
      );

    case "share_ticket":
      // ORG_ADMIN and SUPPORT_AGENT of the owner organization can share
      if (!context?.ticketOwnerOrgId) return false;
      return (
        context.ticketOwnerOrgId === user.activeOrgId &&
        (role === Role.ORG_ADMIN || role === Role.SUPPORT_AGENT)
      );

    case "manage_feature_flags":
      // Restrict to ORG_ADMIN in their active organization
      return role === Role.ORG_ADMIN;

    default:
      return false;
  }
}
