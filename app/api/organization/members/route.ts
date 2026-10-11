import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { MembersService } from "@/backend/modules/organization/membersService";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session || (session as any).error === "RevokedSession" || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId);

  if (!activeMembership || (activeMembership.role !== Role.ORG_ADMIN && activeMembership.role !== Role.PLATFORM_SUPER_ADMIN)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const data = await MembersService.getMembers(user);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("GET /api/organization/members error:", err);
    return NextResponse.json({ error: "Failed to retrieve organization members" }, { status: 500 });
  }
}
