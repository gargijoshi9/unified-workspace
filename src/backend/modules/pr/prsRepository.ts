import { prisma } from "@/backend/shared/prisma";
import { Prisma } from "@prisma/client";

export class PRsRepository {
  static async findMany(where: Prisma.PRWhereInput) {
    return prisma.pR.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        shares: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findUnique(id: string) {
    return prisma.pR.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        versions: { orderBy: { versionNum: "desc" } },
        shares: true,
      },
    });
  }

  static async create(data: Prisma.PRUncheckedCreateInput) {
    return prisma.pR.create({
      data,
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        shares: true,
      },
    });
  }

  static async countVersions(prId: string): Promise<number> {
    return prisma.pRVersion.count({
      where: { prId },
    });
  }

  static async createVersion(prId: string, versionNum: number, description: string) {
    return prisma.pRVersion.create({
      data: { prId, versionNum, description },
    });
  }

  static async update(id: string, data: Prisma.PRUncheckedUpdateInput) {
    return prisma.pR.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        versions: { orderBy: { versionNum: "desc" } },
        shares: true,
      },
    });
  }

  static async createShare(prId: string, sharedWithOrgId: string) {
    return prisma.pRShare.create({
      data: { prId, sharedWithOrgId },
    });
  }

  static async deleteShares(prId: string, sharedWithOrgId: string) {
    return prisma.pRShare.deleteMany({
      where: { prId, sharedWithOrgId },
    });
  }

  static async updateReviewerDecision(reviewerEntryId: string, decision: string) {
    return prisma.pRReviewer.update({
      where: { id: reviewerEntryId },
      data: { decision },
    });
  }

  static async deleteReviewers(prId: string) {
    return prisma.pRReviewer.deleteMany({
      where: { prId },
    });
  }

  static async createReviewers(prId: string, reviewerIds: string[]) {
    return prisma.pRReviewer.createMany({
      data: reviewerIds.map((rid) => ({ prId, userId: rid })),
    });
  }

  static async getMembership(userId: string, orgId: string) {
    return prisma.membership.findUnique({
      where: {
        userId_orgId: { userId, orgId },
      },
    });
  }
}
