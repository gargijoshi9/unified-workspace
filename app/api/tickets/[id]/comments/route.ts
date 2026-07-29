import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canPerform } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

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
      include: { shares: true },
    });

    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

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
