import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canPerform } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        org: {
          select: { id: true, name: true },
        },
        shares: true,
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // Perform authorization check
    if (
      !canPerform(user, "read_ticket", {
        ticketOwnerOrgId: ticket.orgId,
        isTicketSharedWithActiveOrg: isShared,
      })
    ) {
      // Return 404 to avoid leaking the ticket's existence
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Fetch author details for each comment since there is no direct schema relation
    const authorIds = Array.from(new Set(ticket.comments.map((c) => c.authorId)));
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true, email: true },
    });

    const authorMap = new Map(authors.map((a) => [a.id, a]));
    const commentsWithAuthors = ticket.comments.map((c) => ({
      ...c,
      author: authorMap.get(c.authorId) || { name: "Unknown User", email: "" },
    }));

    return NextResponse.json({
      ticket: {
        ...ticket,
        comments: commentsWithAuthors,
        isShared,
      },
    });
  } catch (err) {
    console.error(`GET /api/tickets/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !(session.user as any).activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check
    if (
      !canPerform(user, "edit_ticket", {
        ticketOwnerOrgId: ticket.orgId,
        isTicketSharedWithActiveOrg: isShared,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, description, status } = await req.json();

    const previousStatus = ticket.status;
    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        status: status !== undefined ? status : undefined,
      },
    });

    // Determine audit action and log it
    if (status && status !== previousStatus) {
      await logAudit(
        user.id,
        ticket.orgId,
        "ticket.status_changed",
        "Ticket",
        ticket.id,
        {
          previousStatus,
          newStatus: status,
          title: updatedTicket.title,
        }
      );
    } else {
      await logAudit(
        user.id,
        ticket.orgId,
        "ticket.updated",
        "Ticket",
        ticket.id,
        { title: updatedTicket.title }
      );
    }

    return NextResponse.json({ ticket: updatedTicket });
  } catch (err) {
    console.error(`PATCH /api/tickets/${id} error:`, err);
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

  const { id } = await params;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // BOLA Check
    if (
      !canPerform(user, "delete_ticket", {
        ticketOwnerOrgId: ticket.orgId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Apply soft-delete
    await prisma.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Log the audit event
    await logAudit(
      user.id,
      ticket.orgId,
      "ticket.deleted",
      "Ticket",
      ticket.id,
      { title: ticket.title }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/tickets/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
