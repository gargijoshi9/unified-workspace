import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canPerform } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // BOLA Check
    if (
      !canPerform(user, "share_ticket", {
        ticketOwnerOrgId: ticket.orgId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { sharedWithOrgId } = await req.json();

    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to share with is required" }, { status: 400 });
    }

    if (sharedWithOrgId === ticket.orgId) {
      return NextResponse.json({ error: "Cannot share a ticket with its owner organization" }, { status: 400 });
    }

    // Security Check: Verify there is an APPROVED connection between the owner org and the target org
    const connection = await prisma.orgConnection.findFirst({
      where: {
        status: ConnectionStatus.APPROVED,
        OR: [
          { orgAId: ticket.orgId, orgBId: sharedWithOrgId },
          { orgAId: sharedWithOrgId, orgBId: ticket.orgId },
        ],
      },
    });

    if (!connection) {
      return NextResponse.json({ error: "No approved connection exists with this organization" }, { status: 400 });
    }

    const ticketShare = await prisma.ticketShare.upsert({
      where: {
        ticketId_sharedWithOrgId: {
          ticketId,
          sharedWithOrgId,
        },
      },
      create: {
        ticketId,
        sharedWithOrgId,
      },
      update: {}, // if already shared, do nothing
    });

    // Log the audit event in the ticket's owner organization
    await logAudit(
      user.id,
      ticket.orgId,
      "ticket.shared",
      "Ticket",
      ticketId,
      { sharedWithOrgId }
    );

    return NextResponse.json({ share: ticketShare }, { status: 201 });
  } catch (err) {
    console.error(`POST /api/tickets/${ticketId}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // BOLA Check
    if (
      !canPerform(user, "share_ticket", {
        ticketOwnerOrgId: ticket.orgId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const sharedWithOrgId = url.searchParams.get("orgId");

    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to unshare with is required" }, { status: 400 });
    }

    // Remove sharing
    await prisma.ticketShare.deleteMany({
      where: {
        ticketId,
        sharedWithOrgId,
      },
    });

    // Log the audit event
    await logAudit(
      user.id,
      ticket.orgId,
      "ticket.unshared",
      "Ticket",
      ticketId,
      { unsharedWithOrgId: sharedWithOrgId }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/tickets/${ticketId}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
