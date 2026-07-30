import { canPerform } from "@/backend/modules/auth/authorize";
import { UserSession, PermissionAction, AuthzContext } from "@/backend/modules/auth/auth.types";
import { NextResponse } from "next/server";
import { AuthenticatedHandler } from "./authenticate";

export type ContextCallback = (
  req: Request,
  user: UserSession,
  ...args: unknown[]
) => Promise<AuthzContext | null> | AuthzContext | null;

export function withPermission(
  action: PermissionAction,
  contextCallback?: ContextCallback
) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: Request, user: UserSession, ...args: unknown[]) => {
      let context: AuthzContext | undefined;
      if (contextCallback) {
        const resolved = await contextCallback(req, user, ...args);
        if (resolved) {
          context = resolved;
        }
      }

      if (!canPerform(user, action, context)) {
        // Enforce BOLA: return 404 for resource read/write checks if the resource is private,
        // fallback to 403 Forbidden for actions that are explicitly forbidden but not leaking data.
        const isResourceCheck =
          action.includes("read") ||
          action.includes("edit") ||
          action.includes("delete") ||
          action.includes("share");
        if (isResourceCheck) {
          return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return handler(req, user, ...args);
    };
  };
}
