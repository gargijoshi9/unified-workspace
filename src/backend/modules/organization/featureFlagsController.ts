import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { OrganizationService } from "./organizationService";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const flags = await OrganizationService.getFeatureFlags(user);
    return NextResponse.json({ flags });
  } catch (err) {
    console.error("GET /api/feature-flags error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const { key, enabled } = await req.json();

    if (!key || enabled === undefined) {
      return NextResponse.json({ error: "Missing key or enabled state" }, { status: 400 });
    }

    const result = await OrganizationService.toggleFeatureFlag(user, key, enabled);

    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ flag: result.flag });
  } catch (err) {
    console.error("PATCH /api/feature-flags error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
