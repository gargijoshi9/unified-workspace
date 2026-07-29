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
    // 1. Fetch own organization's tickets (that are not soft-deleted)
    const ownTickets = await prisma.ticket.findMany({
      where: {
        orgId: activeOrgId,
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        org: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch tickets shared with active organization
    const sharedShares = await prisma.ticketShare.findMany({
      where: {
        sharedWithOrgId: activeOrgId,
        ticket: {
          deletedAt: null,
        },
      },
      include: {
        ticket: {
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
            org: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const own = ownTickets.map((t) => ({ ...t, isShared: false }));
    const shared = sharedShares.map((s) => ({ ...s.ticket, isShared: true }));

    return NextResponse.json({ tickets: [...own, ...shared] });
  } catch (err) {
    console.error("GET /api/tickets error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  // Authorization Check
  if (!canPerform(user, "create_ticket", activeOrgId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { title, description } = await req.json();

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        orgId: activeOrgId,
        createdById: user.id,
        status: "OPEN",
      },
    });

    // Log the audit event
    await logAudit(
      user.id,
      activeOrgId,
      "ticket.created",
      "Ticket",
      ticket.id,
      { title }
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error("POST /api/tickets error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
