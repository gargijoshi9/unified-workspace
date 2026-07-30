import { Role } from "@prisma/client";

export type PermissionAction =
  | "create_ticket"
  | "read_ticket"
  | "edit_ticket"
  | "delete_ticket"
  | "comment_ticket"
  | "share_ticket"
  | "manage_feature_flags"
  | "create_pr"
  | "read_pr"
  | "edit_pr"
  | "assign_reviewer"
  | "submit_decision"
  | "merge_pr"
  | "share_pr"
  | "view_audit_logs";

export interface UserSession {
  id: string;
  activeOrgId: string;
  name?: string | null;
  email?: string | null;
  memberships: {
    orgId: string;
    orgName: string;
    role: Role;
  }[];
}

export interface AuthzContext {
  ticketOwnerOrgId?: string;
  isTicketSharedWithActiveOrg?: boolean;
  prOwnerOrgId?: string;
  isPrSharedWithActiveOrg?: boolean;
  prAuthorId?: string;
}
