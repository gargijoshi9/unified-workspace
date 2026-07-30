import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { TicketsService } from "./ticketsService";
import { NextResponse } from "next/server";

export async function getTickets() {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const tickets = await TicketsService.getTickets(user);
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("GET /api/tickets error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function getTicket(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const ticket = await TicketsService.getTicket(id, user);
    if (!ticket) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    return NextResponse.json({ ticket });
  } catch (err) {
    console.error(`GET /api/tickets/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function createTicket(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const body = await req.json();
    const ticket = await TicketsService.createTicket(user, body);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error("POST /api/tickets error:", err);
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function updateTicket(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const body = await req.json();
    const result = await TicketsService.updateTicket(id, user, body);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (err) {
    console.error(`PATCH /api/tickets/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function deleteTicket(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const result = await TicketsService.deleteTicket(id, user);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/tickets/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function shareTicket(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { sharedWithOrgId } = await req.json();
    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Missing sharedWithOrgId" }, { status: 400 });
    }

    const result = await TicketsService.shareTicket(id, user, sharedWithOrgId);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`POST /api/tickets/${id}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function unshareTicket(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { sharedWithOrgId } = await req.json();
    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Missing sharedWithOrgId" }, { status: 400 });
    }

    const result = await TicketsService.unshareTicket(id, user, sharedWithOrgId);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`DELETE /api/tickets/${id}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function createComment(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id: ticketId } = await params;

  try {
    const { content } = await req.json();
    if (!content) {
      return NextResponse.json({ error: "Missing comment content" }, { status: 400 });
    }

    const result = await TicketsService.createComment(ticketId, user, content);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Embed author metadata as standard payload format
    return NextResponse.json({
      comment: {
        ...result.comment,
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
