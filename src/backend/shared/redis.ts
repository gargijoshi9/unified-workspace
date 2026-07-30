import Redis from "ioredis";

const globalForRedis = global as unknown as { redis: Redis | undefined };

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Automatically enable TLS if connection string points to cloud Upstash (*.upstash.io) or starts with rediss://
const needsTls = url.includes("upstash.io") || url.startsWith("rediss://");

export const redis =
  globalForRedis.redis ||
  new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    tls: needsTls ? {} : undefined,
  });

redis.on("error", (err) => {
  // Catch background connection reset warnings quietly
  if (err.message?.includes("ECONNRESET") || err.message?.includes("max retries")) return;
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
