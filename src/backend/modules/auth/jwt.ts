import { redis } from "@/backend/shared/redis";
import { JWT } from "next-auth/jwt";
import { User } from "next-auth";

export interface JwtCallbackParams {
  token: JWT;
  user?: User;
  trigger?: "signIn" | "signUp" | "update";
  session?: { activeOrgId?: string };
}

// Helper to run Redis calls with a strict 400ms timeout to avoid hanging serverless functions
async function redisGetWithTimeout(key: string, timeoutMs = 400): Promise<string | null> {
  try {
    const result = await Promise.race([
      redis.get(key),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Redis timeout")), timeoutMs)),
    ]);
    return result;
  } catch {
    return null; // Fallback gracefully if Redis call is slow or times out
  }
}

export async function handleJwtCallback({ token, user, trigger, session }: JwtCallbackParams): Promise<JWT> {
  // First login: attach memberships + default active org to the token
  if (user) {
    token.id = user.id;
    token.memberships = user.memberships;
    token.activeOrgId = user.memberships?.[0]?.orgId ?? null;

    try {
      const redisKey = `user:session-version:${user.id}`;
      let currentVersion = await redisGetWithTimeout(redisKey);
      if (!currentVersion) {
        currentVersion = "1";
        await redis.set(redisKey, currentVersion).catch(() => {});
      }
      token.sessionVersion = currentVersion;
    } catch {
      token.sessionVersion = "1";
    }
  }

  // Handle org switch trigger from client
  if (trigger === "update" && session?.activeOrgId) {
    token.activeOrgId = session.activeOrgId;
  }

  // Check if token has been revoked by comparing with Redis session version
  if (token.id) {
    try {
      const redisKey = `user:session-version:${token.id}`;
      const currentVersion = await redisGetWithTimeout(redisKey);
      if (currentVersion && token.sessionVersion !== currentVersion) {
        token.revoked = true;
      }
    } catch {
      // Degrade gracefully if Redis is unresponsive
    }
  }

  return token;
}
