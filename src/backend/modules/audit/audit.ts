import { prisma } from "@/backend/shared/prisma";
import { Prisma } from "@prisma/client";

export async function logAudit(
  actorId: string,
  orgId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue
) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorId,
        action,
        entityType,
        entityId,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log entry:", err);
  }
}
