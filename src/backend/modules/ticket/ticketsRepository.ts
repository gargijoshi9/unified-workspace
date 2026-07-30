import { prisma } from "@/backend/shared/prisma";
import { Prisma } from "@prisma/client";

export class TicketsRepository {
  static async findMany(where: Prisma.TicketWhereInput) {
    return prisma.ticket.findMany({
      where,
      include: {
        org: { select: { name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        shares: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findUnique(id: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        shares: true,
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) return null;

    const authorIds = Array.from(new Set(ticket.comments.map((c) => c.authorId)));
    const authors = authorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const authorMap = new Map(authors.map((u) => [u.id, u]));

    const commentsWithAuthor = ticket.comments.map((c) => ({
      ...c,
      author: authorMap.get(c.authorId) || { name: "Unknown User", email: "" },
    }));

    return {
      ...ticket,
      comments: commentsWithAuthor,
    };
  }

  static async create(data: Prisma.TicketUncheckedCreateInput) {
    return prisma.ticket.create({
      data,
      include: {
        org: { select: { name: true } },
        shares: true,
      },
    });
  }

  static async update(id: string, data: Prisma.TicketUncheckedUpdateInput) {
    return prisma.ticket.update({
      where: { id },
      data,
      include: {
        org: { select: { name: true } },
        shares: true,
      },
    });
  }

  static async delete(id: string) {
    return prisma.ticket.delete({
      where: { id },
    });
  }

  static async createShare(ticketId: string, sharedWithOrgId: string) {
    return prisma.ticketShare.create({
      data: { ticketId, sharedWithOrgId },
    });
  }

  static async deleteShares(ticketId: string, sharedWithOrgId: string) {
    return prisma.ticketShare.deleteMany({
      where: { ticketId, sharedWithOrgId },
    });
  }

  static async createComment(ticketId: string, authorId: string, content: string) {
    return prisma.ticketComment.create({
      data: { ticketId, authorId, body: content },
    });
  }
}
