import { redis } from "./redis";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in ms
}

/**
 * Distributed Redis rate limiter using fixed window with atomic increment.
 * Fallback to allow if Redis is unavailable to prevent total service outage.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const now = Date.now();
  const resetTime = now + windowSeconds * 1000;

  try {
    const current = await redis.incr(redisKey);
    if (current === 1) {
      // First hit, set TTL
      await redis.expire(redisKey, windowSeconds);
    }

    const remaining = Math.max(0, limit - current);
    const success = current <= limit;

    return {
      success,
      limit,
      remaining,
      resetTime,
    };
  } catch (error) {
    console.error(`[RateLimit] Redis error checking rate limit for ${redisKey}:`, error);
    // In event of Redis outage, fail open with warning logged
    return {
      success: true,
      limit,
      remaining: 1,
      resetTime,
    };
  }
}
