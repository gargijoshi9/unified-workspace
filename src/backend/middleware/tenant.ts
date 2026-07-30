import { UserSession } from "@/backend/modules/auth/auth.types";
import { NextResponse } from "next/server";
import { AuthenticatedHandler } from "./authenticate";

export function withTenant(handler: AuthenticatedHandler): AuthenticatedHandler {
  return async (req: Request, user: UserSession, ...args: unknown[]) => {
    const activeOrgId = user.activeOrgId;
    if (!activeOrgId) {
      return NextResponse.json({ error: "No active organization selected" }, { status: 400 });
    }

    // Optional: Verifies that the client organization header matches activeOrgId to prevent header spoofing
    const clientOrgHeader = req.headers.get("x-org-id");
    if (clientOrgHeader && clientOrgHeader !== activeOrgId) {
      return NextResponse.json({ error: "Active organization context mismatch" }, { status: 403 });
    }

    return handler(req, user, ...args);
  };
}
