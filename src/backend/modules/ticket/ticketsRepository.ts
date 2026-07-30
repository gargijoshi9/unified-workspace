import { prisma } from "@/backend/shared/prisma";
import { Prisma } from "@prisma/client";

export class TicketsRepository {
  static async findMany(where: Prisma.TicketWhereInput) {
    return prisma.ticket.findMany({
      where,
      include: {
        org: { select: { name: true } },
        shares: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findUnique(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true } },
        shares: true,
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
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
