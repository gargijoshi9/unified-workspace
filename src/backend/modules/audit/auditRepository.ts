import { prisma } from "@/backend/shared/prisma";
import { Prisma } from "@prisma/client";

export class AuditRepository {
  static async findMany(where: Prisma.AuditLogWhereInput) {
    return prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findDistinctActions(orgId: string) {
    return prisma.auditLog.findMany({
      where: { orgId },
      select: { action: true },
      distinct: ["action"],
    });
  }

  static async findDistinctActors(orgId: string) {
    return prisma.auditLog.findMany({
      where: { orgId },
      select: { actorId: true },
      distinct: ["actorId"],
    });
  }

  static async findUsers(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
  }
}
