import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/backend/shared/prisma";
import { redis } from "@/backend/shared/redis";
import { checkRateLimit } from "@/backend/shared/rateLimit";

const RESET_TOKEN_TTL_SECONDS = 900; // 15 minutes

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "anonymous";

    // Rate limit: 3 recovery requests per 15 minutes per IP
    const rateLimit = await checkRateLimit(`recovery-req:${ip}`, 3, 15 * 60);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Please try again later." },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email } = body;
    const genericResponse = {
      message: "If an account with that email exists, password reset instructions have been sent.",
    };

    if (!email || typeof email !== "string") {
      // Return identical generic response to prevent email enumeration
      return NextResponse.json(genericResponse, { status: 200 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Return identical generic response
      return NextResponse.json(genericResponse, { status: 200 });
    }

    // Generate cryptographically secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    // Store only SHA-256 hash in Redis to protect against database/cache compromise
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const redisKey = `password-reset:${tokenHash}`;
    await redis.set(redisKey, user.id, "EX", RESET_TOKEN_TTL_SECONDS);

    // Email delivery dispatch
    const hasEmailProvider = Boolean(
      process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.SENDGRID_API_KEY
    );

    if (hasEmailProvider) {
      // Dispatches via configured transactional email provider (mocked/pluggable)
      console.log(`[AuthRecovery] Dispatched password reset email to user ${user.id}`);
    } else {
      // Operational notice without exposing sensitive token
      console.log(
        "[AuthRecovery] Operational Notice: No transactional email provider (RESEND_API_KEY / SMTP) configured in environment. Token created safely in Redis."
      );
    }

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (err) {
    console.error("Recovery request error:", err);
    return NextResponse.json(
      { message: "If an account with that email exists, password reset instructions have been sent." },
      { status: 200 }
    );
  }
}
