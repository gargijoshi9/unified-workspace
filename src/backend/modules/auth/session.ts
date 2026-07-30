import { redis } from "@/backend/shared/redis";
import { Session } from "next-auth";
import { JWT } from "next-auth/jwt";

export interface SessionCallbackParams {
  session: Session;
  token: JWT;
}

export async function handleSessionCallback({ session, token }: SessionCallbackParams): Promise<Session> {
  if (token?.revoked) {
    return {
      ...session,
      user: null as unknown as typeof session.user,
      error: "RevokedSession",
    } as unknown as Session;
  }

  // Expose id, memberships, active org to the client via useSession()
  if (token?.id) {
    session.user.id = token.id as string;
  }
  if (token?.memberships) {
    session.user.memberships = token.memberships as typeof session.user.memberships;
  }
  if (token?.activeOrgId !== undefined) {
    session.user.activeOrgId = token.activeOrgId as string | null;
  }
  return session;
}

export async function handleSignOutEvent(message: { token: JWT | null } | { session: unknown }): Promise<void> {
  try {
    if ("token" in message && message.token?.id) {
      const redisKey = `user:session-version:${message.token.id}`;
      await redis.incr(redisKey);
      console.log(`[Logout-Everywhere] Incremented session version for user ${message.token.id}`);
    }
  } catch (error) {
    console.error("Error updating session version in Redis during signOut:", error);
  }
}
