import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canPerform } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const flags = await prisma.featureFlag.findMany({
      where: { orgId: activeOrgId },
    });

    return NextResponse.json({ flags });
  } catch (err) {
    console.error("GET /api/feature-flags error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  // BOLA Check: only Org Admin can manage feature flags
  if (!canPerform(user, "manage_feature_flags", activeOrgId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { key, enabled } = await req.json();

    if (!key || enabled === undefined) {
      return NextResponse.json({ error: "Missing key or enabled state" }, { status: 400 });
    }

    const flag = await prisma.featureFlag.upsert({
      where: {
        orgId_key: {
          orgId: activeOrgId,
          key,
        },
      },
      update: {
        enabled,
      },
      create: {
        orgId: activeOrgId,
        key,
        enabled,
      },
    });

    // Log the audit event in the active organization
    await logAudit(
      user.id,
      activeOrgId,
      "feature_flag.toggled",
      "FeatureFlag",
      flag.id,
      { key, enabled }
    );

    return NextResponse.json({ flag });
  } catch (err) {
    console.error("PATCH /api/feature-flags error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
