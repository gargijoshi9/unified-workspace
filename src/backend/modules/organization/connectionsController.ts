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
    const orgs = await OrganizationService.getConnections(user);
    return NextResponse.json({ orgs });
  } catch (err) {
    console.error("GET /api/connections/orgs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
