import { AuditRepository } from "./auditRepository";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { canPerform } from "@/backend/modules/auth/authorize";
import { Prisma } from "@prisma/client";

export class AuditService {
  static async getAuditLogs(
    user: UserSession,
    queryOrgId: string,
    filterActorId: string | null,
    filterAction: string | null,
    filterStartDate: string | null,
    filterEndDate: string | null
  ) {
    if (!canPerform(user, "view_audit_logs")) {
      return { error: "Forbidden" };
    }

    // BOLA Check: Verify user has membership in target orgId
    const hasMembership = user.memberships.some((m) => m.orgId === queryOrgId);
    if (!hasMembership && user.activeOrgId !== queryOrgId) {
      // Platform Super Admin bypasses membership check
      const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId);
      if (activeMembership?.role !== "PLATFORM_SUPER_ADMIN") {
        return { error: "Forbidden" };
      }
    }

    const whereClause: Prisma.AuditLogWhereInput = { orgId: queryOrgId };

    if (filterActorId) {
      whereClause.actorId = filterActorId;
    }
    if (filterAction) {
      whereClause.action = filterAction;
    }
    if (filterStartDate || filterEndDate) {
      whereClause.createdAt = {};
      if (filterStartDate) {
        whereClause.createdAt.gte = new Date(filterStartDate);
      }
      if (filterEndDate) {
        whereClause.createdAt.lte = new Date(filterEndDate);
      }
    }

    const logs = await AuditRepository.findMany(whereClause);

    // Also get all unique action types for the filter dropdown
    const distinctActions = await AuditRepository.findDistinctActions(queryOrgId);
    const actionsList = distinctActions.map((a) => a.action);

    // Get all users who have triggered audit logs in this org for the actor filter dropdown
    const distinctActors = await AuditRepository.findDistinctActors(queryOrgId);
    const actorIds = distinctActors.map((a) => a.actorId);
    const actorsList = await AuditRepository.findUsers(actorIds);

    return {
      logs,
      actions: actionsList,
      actors: actorsList,
    };
  }
}
