import { auth } from "@/backend/modules/auth/auth.service";
import { prisma } from "@/backend/shared/prisma";
import { canPerform } from "@/backend/modules/auth/authorize";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function getAuditLogs(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  // Authorization check
  if (!canPerform(user, "view_audit_logs")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const queryOrgId = searchParams.get("orgId") || activeOrgId;
    const filterActorId = searchParams.get("userId");
    const filterAction = searchParams.get("action");
    const filterStartDate = searchParams.get("startDate");
    const filterEndDate = searchParams.get("endDate");

    // BOLA Check: Verify user has membership in target orgId
    const hasMembership = user.memberships.some((m) => m.orgId === queryOrgId);
    if (!hasMembership && user.activeOrgId !== queryOrgId) {
      // Platform Super Admin bypasses membership check
      const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId);
      if (activeMembership?.role !== "PLATFORM_SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also get all unique action types for the filter dropdown
    const distinctActions = await prisma.auditLog.findMany({
      where: { orgId: queryOrgId },
      select: { action: true },
      distinct: ["action"],
    });

    const actionsList = distinctActions.map((a) => a.action);

    // Get all users who have triggered audit logs in this org for the actor filter dropdown
    const distinctActors = await prisma.auditLog.findMany({
      where: { orgId: queryOrgId },
      select: { actorId: true },
      distinct: ["actorId"],
    });

    const actorIds = distinctActors.map((a) => a.actorId);
    const actorsList = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({
      logs,
      actions: actionsList,
      actors: actorsList,
    });
  } catch (err) {
    console.error("GET /api/audit error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
