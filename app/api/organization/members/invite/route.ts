import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { MembersService } from "@/backend/modules/organization/membersService";
import { checkRateLimit } from "@/backend/shared/rateLimit";
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

  // Rate limit: 20 invites per hour per org
  const rateLimit = await checkRateLimit(`invite:${user.activeOrgId}`, 20, 3600);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many invitation requests. Please try again later." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const result = await MembersService.inviteMember(user, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err.message === "MEMBER_ALREADY_EXISTS") {
      return NextResponse.json({ error: "This user is already an active member of this organization." }, { status: 409 });
    }
    if (err.message === "INVALID_EMAIL" || err.message === "INVALID_EMAIL_FORMAT") {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (err.message === "UNAUTHORIZED_ROLE_ASSIGNMENT" || err.message === "PRIVILEGE_ESCALATION_FORBIDDEN") {
      return NextResponse.json({ error: "Unauthorized role assignment. Admins may only invite Support Agents or Reviewers." }, { status: 403 });
    }

    console.error("POST /api/organization/members/invite error:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("id");

    if (!invitationId) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
    }

    await MembersService.cancelInvitation(user, invitationId);
    return NextResponse.json({ success: true, message: "Invitation cancelled" });
  } catch (err: any) {
    if (err.message === "INVITATION_NOT_FOUND") {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    console.error("DELETE /api/organization/members/invite error:", err);
    return NextResponse.json({ error: "Failed to cancel invitation" }, { status: 500 });
  }
}
