import { TicketsRepository } from "./ticketsRepository";
import { UserSession, AuthzContext } from "@/backend/modules/auth/auth.types";
import { canPerform } from "@/backend/modules/auth/authorize";
import { logAudit } from "@/backend/modules/audit/audit";
import { TicketStatus } from "@prisma/client";

export class TicketsService {
  static async getTickets(user: UserSession) {
    return TicketsRepository.findMany({
      OR: [
        { orgId: user.activeOrgId },
        {
          shares: {
            some: { sharedWithOrgId: user.activeOrgId },
          },
        },
      ],
    });
  }

  static async getTicket(id: string, user: UserSession) {
    const ticket = await TicketsRepository.findUnique(id);
    if (!ticket) return null;

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    if (!canPerform(user, "read_ticket", authzContext)) {
      return null; // BOLA protection: do not leak resource existence
    }

    return ticket;
  }

  static async createTicket(
    user: UserSession,
    payload: { title: string; description: string; status?: TicketStatus }
  ) {
    if (!canPerform(user, "create_ticket")) {
      throw new Error("Forbidden");
    }

    const ticket = await TicketsRepository.create({
      title: payload.title,
      description: payload.description,
      status: payload.status || TicketStatus.OPEN,
      orgId: user.activeOrgId,
      createdById: user.id,
    });

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.created",
      "Ticket",
      ticket.id,
      { title: payload.title }
    );

    return ticket;
  }

  static async updateTicket(
    id: string,
    user: UserSession,
    payload: { title?: string; description?: string; status?: TicketStatus }
  ) {
    const ticket = await TicketsRepository.findUnique(id);
    if (!ticket) return { error: "NotFound" };

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    // If resource is private and doesn't belong to the active org, return NotFound (BOLA)
    if (ticket.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "edit_ticket", authzContext)) {
      return { error: "Forbidden" };
    }

    const updatedTicket = await TicketsRepository.update(id, payload);

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.updated",
      "Ticket",
      id,
      payload
    );

    return { ticket: updatedTicket };
  }

  static async deleteTicket(id: string, user: UserSession) {
    const ticket = await TicketsRepository.findUnique(id);
    if (!ticket) return { error: "NotFound" };

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    // BOLA Check: if not owned by user's org and not shared, return NotFound
    if (ticket.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "delete_ticket", authzContext)) {
      return { error: "Forbidden" };
    }

    await TicketsRepository.delete(id);

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.deleted",
      "Ticket",
      id
    );

    return { success: true };
  }

  static async shareTicket(id: string, user: UserSession, sharedWithOrgId: string) {
    const ticket = await TicketsRepository.findUnique(id);
    if (!ticket) return { error: "NotFound" };

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    if (ticket.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "share_ticket", authzContext)) {
      return { error: "Forbidden" };
    }

    await TicketsRepository.createShare(id, sharedWithOrgId);

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.shared",
      "Ticket",
      id,
      { sharedWithOrgId }
    );

    return { success: true };
  }

  static async unshareTicket(id: string, user: UserSession, sharedWithOrgId: string) {
    const ticket = await TicketsRepository.findUnique(id);
    if (!ticket) return { error: "NotFound" };

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    if (ticket.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "share_ticket", authzContext)) {
      return { error: "Forbidden" };
    }

    await TicketsRepository.deleteShares(id, sharedWithOrgId);

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.unshared",
      "Ticket",
      id,
      { sharedWithOrgId }
    );

    return { success: true };
  }

  static async createComment(ticketId: string, user: UserSession, content: string) {
    const ticket = await TicketsRepository.findUnique(ticketId);
    if (!ticket) return { error: "NotFound" };

    const isShared = ticket.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      ticketOwnerOrgId: ticket.orgId,
      isTicketSharedWithActiveOrg: isShared,
    };

    if (ticket.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "comment_ticket", authzContext)) {
      return { error: "Forbidden" };
    }

    const comment = await TicketsRepository.createComment(ticketId, user.id, content);

    await logAudit(
      user.id,
      user.activeOrgId,
      "ticket.commented",
      "Ticket",
      ticketId,
      { commentId: comment.id }
    );

    return { comment };
  }
}
