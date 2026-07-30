import { prisma } from "@/backend/shared/prisma";

export class NotificationRepository {
  static async countUnreadDigests(userId: string) {
    return prisma.digest.count({
      where: { userId, read: false },
    });
  }

  static async findManyDigests(userId: string, limit: number) {
    return prisma.digest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async updateDigest(id: string, userId: string, read: boolean) {
    return prisma.digest.update({
      where: { id, userId },
      data: { read },
    });
  }

  static async updateManyDigests(userId: string, read: boolean) {
    return prisma.digest.updateMany({
      where: { userId, read: !read },
      data: { read },
    });
  }

  static async findAllMemberships() {
    return prisma.membership.findMany();
  }
}
