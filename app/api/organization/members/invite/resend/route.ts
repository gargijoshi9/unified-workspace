import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { MembersService } from "@/backend/modules/organization/membersService";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
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
    const body = await req.json();
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
    }

    const result = await MembersService.resendInvitation(user, invitationId);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message === "INVITATION_NOT_FOUND") {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }
    if (err.message === "INVITATION_ALREADY_ACCEPTED") {
      return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 400 });
    }

    console.error("POST /api/organization/members/invite/resend error:", err);
    return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 });
  }
}
