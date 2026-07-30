import { auth } from "@/backend/modules/auth/auth.service";
import { prisma } from "@/backend/shared/prisma";
import { canPerform } from "@/backend/modules/auth/authorize";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { logAudit } from "@/backend/modules/audit/audit";
import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";

// GET /api/tickets
export async function getTickets() {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
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

// POST /api/tickets
export async function createTicket(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  // Authorization Check
  if (!canPerform(user, "create_ticket")) {
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

// GET /api/tickets/[id]
export async function getTicket(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
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

// PATCH /api/tickets/[id]
export async function updateTicket(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isOwner = ticket.orgId === activeOrgId;
    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check: If not same org and not shared, return 404
    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // RBAC Check
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

// DELETE /api/tickets/[id]
export async function deleteTicket(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isOwner = ticket.orgId === activeOrgId;
    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check: If not same org and not shared, return 404
    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // RBAC Check
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

// POST /api/tickets/[id]/share
export async function shareTicket(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isOwner = ticket.orgId === activeOrgId;
    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check: If not same org and not shared, return 404
    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // RBAC Check
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

// DELETE /api/tickets/[id]/share
export async function unshareTicket(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isOwner = ticket.orgId === activeOrgId;
    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check: If not same org and not shared, return 404
    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // RBAC Check
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

// POST /api/tickets/[id]/comments
export async function createComment(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isOwner = ticket.orgId === activeOrgId;
    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    // BOLA Check: If not same org and not shared, return 404
    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // BOLA check: Must have read/comment permission on the ticket
    if (
      !canPerform(user, "comment_ticket", {
        ticketOwnerOrgId: ticket.orgId,
        isTicketSharedWithActiveOrg: isShared,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { body } = await req.json();
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: user.id,
        body: body.trim(),
      },
    });

    // Log the audit event in the ticket's owner organization
    await logAudit(
      user.id,
      ticket.orgId,
      "ticket.comment_added",
      "Ticket",
      ticketId,
      { commentId: comment.id, bodyExcerpt: body.trim().substring(0, 50) }
    );

    return NextResponse.json({
      comment: {
        ...comment,
        author: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    }, { status: 201 });
  } catch (err) {
    console.error(`POST /api/tickets/${ticketId}/comments error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
