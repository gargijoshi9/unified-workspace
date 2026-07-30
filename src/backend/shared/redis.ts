import Redis from "ioredis";

const globalForRedis = global as unknown as { redis: Redis | undefined };

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redis =
  globalForRedis.redis ||
  new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });

redis.on("error", (err) => {
  // Catch background connection reset warnings quietly
  if (err.message?.includes("ECONNRESET") || err.message?.includes("max retries")) return;
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
