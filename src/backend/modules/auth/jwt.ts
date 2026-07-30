import { redis } from "@/backend/shared/redis";
import { JWT } from "next-auth/jwt";
import { User } from "next-auth";

export interface JwtCallbackParams {
  token: JWT;
  user?: User;
  trigger?: "signIn" | "signUp" | "update";
  session?: { activeOrgId?: string };
}

export async function handleJwtCallback({ token, user, trigger, session }: JwtCallbackParams): Promise<JWT> {
  // First login: attach memberships + default active org to the token
  if (user) {
    token.id = user.id;
    token.memberships = user.memberships;
    token.activeOrgId = user.memberships?.[0]?.orgId ?? null;

    try {
      const redisKey = `user:session-version:${user.id}`;
      let currentVersion = await redis.get(redisKey);
      if (!currentVersion) {
        currentVersion = "1";
        await redis.set(redisKey, currentVersion);
      }
      token.sessionVersion = currentVersion;
    } catch (e) {
      console.error("Redis error during login token version init:", e);
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
      const currentVersion = await redis.get(redisKey);
      if (currentVersion && token.sessionVersion !== currentVersion) {
        token.revoked = true;
      }
    } catch (e) {
      console.error("Redis error during jwt verification:", e);
    }
  }

  return token;
}
