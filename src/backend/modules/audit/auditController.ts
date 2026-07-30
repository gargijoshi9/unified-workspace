import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { AuditService } from "./auditService";
import { NextResponse } from "next/server";

export async function getAuditLogs(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const { searchParams } = new URL(req.url);
    const queryOrgId = searchParams.get("orgId") || activeOrgId;
    const filterActorId = searchParams.get("userId");
    const filterAction = searchParams.get("action");
    const filterStartDate = searchParams.get("startDate");
    const filterEndDate = searchParams.get("endDate");

    const result = await AuditService.getAuditLogs(
      user,
      queryOrgId,
      filterActorId,
      filterAction,
      filterStartDate,
      filterEndDate
    );

    if ("error" in result) {
      if (result.error === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/audit error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
