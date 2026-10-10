import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/shared/prisma";
import { redis } from "@/backend/shared/redis";
import { checkRateLimit } from "@/backend/shared/rateLimit";

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "anonymous";

    // Rate limit: 5 reset attempts per 15 minutes per IP
    const rateLimit = await checkRateLimit(`recovery-reset:${ip}`, 5, 15 * 60);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many reset attempts. Please try again later." },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { token, newPassword } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 8 and 128 characters long" },
        { status: 400 }
      );
    }

    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: "Password must contain at least one letter and one number" },
        { status: 400 }
      );
    }

    // Hash incoming token to match Redis key
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const redisKey = `password-reset:${tokenHash}`;

    const userId = await redis.get(redisKey);
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });

    if (!user) {
      await redis.del(redisKey);
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Hash new password securely
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password in DB
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate single-use token immediately
    await redis.del(redisKey);

    // Global session revocation: increment Redis session version to invalidate all active JWTs
    const sessionVersionKey = `user:session-version:${userId}`;
    await redis.incr(sessionVersionKey);

    // Record audit trail if user has an associated organization
    const defaultOrgId = user.memberships[0]?.orgId;
    if (defaultOrgId) {
      await prisma.auditLog.create({
        data: {
          orgId: defaultOrgId,
          actorId: user.id,
          action: "user.password_reset",
          entityType: "User",
          entityId: user.id,
          metadata: { resetMethod: "recovery_token" },
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. All active sessions have been revoked.",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
