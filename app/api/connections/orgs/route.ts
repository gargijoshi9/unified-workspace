import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const connections = await prisma.orgConnection.findMany({
      where: {
        status: ConnectionStatus.APPROVED,
        OR: [
          { orgAId: activeOrgId },
          { orgBId: activeOrgId },
        ],
      },
      include: {
        orgA: { select: { id: true, name: true } },
        orgB: { select: { id: true, name: true } },
      },
    });

    const connectedOrgs = connections.map((conn) => {
      return conn.orgAId === activeOrgId ? conn.orgB : conn.orgA;
    });

    return NextResponse.json({ orgs: connectedOrgs });
  } catch (err) {
    console.error("GET /api/connections/orgs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
