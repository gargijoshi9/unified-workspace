import { prisma } from "@/backend/shared/prisma";
import { ConnectionStatus } from "@prisma/client";

export class OrganizationRepository {
  static async findConnections(orgId: string) {
    return prisma.orgConnection.findMany({
      where: {
        status: ConnectionStatus.APPROVED,
        OR: [
          { orgAId: orgId },
          { orgBId: orgId },
        ],
      },
      include: {
        orgA: { select: { id: true, name: true } },
        orgB: { select: { id: true, name: true } },
      },
    });
  }

  static async findFeatureFlags(orgId: string) {
    return prisma.featureFlag.findMany({
      where: { orgId },
    });
  }

  static async upsertFeatureFlag(orgId: string, key: string, enabled: boolean) {
    return prisma.featureFlag.upsert({
      where: {
        orgId_key: { orgId, key },
      },
      update: {
        enabled,
      },
      create: {
        orgId,
        key,
        enabled,
      },
    });
  }
}
