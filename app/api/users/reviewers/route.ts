import { auth } from "@/backend/modules/auth/auth.service";
import { prisma } from "@/backend/shared/prisma";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeOrgId = (session.user as any).activeOrgId;

  try {
    const memberships = await prisma.membership.findMany({
      where: {
        orgId: activeOrgId,
        role: Role.REVIEWER_APPROVER,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const reviewers = memberships.map((m) => m.user);

    return NextResponse.json({ reviewers });
  } catch (err) {
    console.error("GET /api/users/reviewers error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
