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

    // Email delivery dispatch via Resend API
    if (process.env.RESEND_API_KEY) {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
      const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [normalizedEmail],
            subject: "Reset your organization workspace password",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
                <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 12px;">Password Reset Request</h2>
                <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Hello ${user.name || "there"},</p>
                <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">We received a request to reset your password for the <strong>Unified Organization Workspace</strong>. Click the button below to choose a new password. This link is single-use and will expire in <strong>15 minutes</strong>.</p>
                <div style="margin: 28px 0;">
                  <a href="${resetUrl}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
                </div>
                <p style="font-size: 12px; color: #6b7280; line-height: 1.5;">If the button does not work, copy and paste this link into your browser:<br/><a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a></p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                <p style="font-size: 11px; color: #9ca3af;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              </div>
            `,
          }),
        });

        if (!resendRes.ok) {
          const errData = await resendRes.json().catch(() => ({}));
          console.error("[AuthRecovery] Resend API error:", errData);
        } else {
          console.log(`[AuthRecovery] Successfully dispatched password reset email via Resend to ${normalizedEmail}`);
        }
      } catch (sendErr) {
        console.error("[AuthRecovery] Failed to send email via Resend:", sendErr);
      }
    } else {
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
