import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { NextResponse } from "next/server";

export type AuthenticatedHandler = (
  req: Request,
  user: UserSession,
  ...args: unknown[]
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (req: Request, ...args: unknown[]) => {
    const session = await auth();
    if (!session || !session.user?.activeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as UserSession;
    return handler(req, user, ...args);
  };
}
