import { Role } from "@prisma/client";
import { PermissionAction } from "./auth.types";

// Matrix for actions that can be checked statically without context (role-based)
export const rolePermissions: Record<Role, PermissionAction[]> = {
  [Role.PLATFORM_SUPER_ADMIN]: [
    "create_ticket", "read_ticket", "edit_ticket", "delete_ticket", "comment_ticket", "share_ticket",
    "manage_feature_flags", "create_pr", "read_pr", "edit_pr", "assign_reviewer", "submit_decision", "merge_pr", "share_pr",
    "view_audit_logs"
  ],
  [Role.ORG_ADMIN]: [
    "create_ticket", "read_ticket", "edit_ticket", "delete_ticket", "comment_ticket", "share_ticket",
    "manage_feature_flags", "create_pr", "read_pr", "edit_pr", "assign_reviewer", "submit_decision", "merge_pr", "share_pr",
    "view_audit_logs"
  ],
  [Role.SUPPORT_AGENT]: [
    "create_ticket", "read_ticket", "edit_ticket", "comment_ticket", "share_ticket"
  ],
  [Role.REVIEWER_APPROVER]: [
    "read_ticket", "comment_ticket",
    "create_pr", "read_pr", "submit_decision",
    "view_audit_logs"
  ],
  [Role.CROSS_ORG_GUEST]: [
    "read_ticket", "comment_ticket", "read_pr"
  ]
};
