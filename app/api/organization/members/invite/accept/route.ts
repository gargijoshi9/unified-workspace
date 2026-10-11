import { MembersService } from "@/backend/modules/organization/membersService";
import { checkRateLimit } from "@/backend/shared/rateLimit";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "Missing invitation token" }, { status: 400 });
    }

    const result = await MembersService.verifyInvitationToken(token);
    return NextResponse.json(result, { status: result.valid ? 200 : 400 });
  } catch (err) {
    console.error("GET /api/organization/members/invite/accept error:", err);
    return NextResponse.json({ valid: false, error: "Failed to verify invitation" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  // Rate limit: 10 acceptance attempts per 15 mins per IP
  const rateLimit = await checkRateLimit(`accept-invite:${ip}`, 10, 900);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const result = await MembersService.acceptInvitation(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    if (err.message === "INVALID_TOKEN") {
      return NextResponse.json({ error: "Invalid invitation token." }, { status: 400 });
    }
    if (err.message === "INVITATION_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Invitation is no longer valid or has already been accepted." }, { status: 400 });
    }
    if (err.message === "INVITATION_EXPIRED") {
      return NextResponse.json({ error: "This invitation link has expired." }, { status: 400 });
    }
    if (err.message === "PASSWORD_REQUIREMENTS_NOT_MET") {
      return NextResponse.json({ error: "Password must be at least 8 characters long." }, { status: 400 });
    }
    if (err.message === "PASSWORD_COMPLEXITY_NOT_MET") {
      return NextResponse.json({ error: "Password must contain at least one letter and one number." }, { status: 400 });
    }

    console.error("POST /api/organization/members/invite/accept error:", err);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
