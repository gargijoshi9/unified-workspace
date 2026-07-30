import { logAudit } from "@/backend/modules/audit/audit";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { AuthenticatedHandler } from "./authenticate";
import { Prisma } from "@prisma/client";

export type AuditMetadataCallback = (
  req: Request,
  user: UserSession,
  res: Response,
  ...args: unknown[]
) => Promise<Prisma.InputJsonValue> | Prisma.InputJsonValue;

export function withAudit(
  action: string,
  entityType: string,
  getEntityId: (res: Response) => string | Promise<string>,
  getMetadata?: AuditMetadataCallback
) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: Request, user: UserSession, ...args: unknown[]) => {
      const res = await handler(req, user, ...args);

      // Only log audit event for successful operations (status codes 2xx)
      if (res.status >= 200 && res.status < 300) {
        try {
          const entityId = await getEntityId(res.clone());
          let metadata: Prisma.InputJsonValue | undefined = undefined;
          if (getMetadata) {
            metadata = await getMetadata(req, user, res.clone(), ...args);
          }

          // Trigger asynchronous audit logging
          await logAudit(
            user.id,
            user.activeOrgId,
            action,
            entityType,
            entityId,
            metadata
          );
        } catch (auditErr) {
          console.error("Failed to automatically log audit event in middleware:", auditErr);
        }
      }

      return res;
    };
  };
}
