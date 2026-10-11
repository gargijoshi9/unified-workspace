import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { MembersService } from "@/backend/modules/organization/membersService";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session as any).error === "RevokedSession" || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId);

  if (!activeMembership || (activeMembership.role !== Role.ORG_ADMIN && activeMembership.role !== Role.PLATFORM_SUPER_ADMIN)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const result = await MembersService.updateMember(user, id, body);
    return NextResponse.json({ success: true, member: result });
  } catch (err: any) {
    if (err.message === "MEMBERSHIP_NOT_FOUND") {
      return NextResponse.json({ error: "Member not found in this organization" }, { status: 404 });
    }
    if (err.message === "PRIVILEGE_ESCALATION_FORBIDDEN") {
      return NextResponse.json({ error: "Cannot assign privileged super-admin role." }, { status: 403 });
    }
    if (err.message === "CANNOT_REMOVE_LAST_ADMIN") {
      return NextResponse.json({ error: "Cannot deactivate or demote the last remaining Organization Administrator." }, { status: 400 });
    }
    if (err.message === "CANNOT_DEACTIVATE_SELF") {
      return NextResponse.json({ error: "You cannot deactivate your own account from here." }, { status: 400 });
    }

    console.error(`PATCH /api/organization/members/${id} error:`, err);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}
