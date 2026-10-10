import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/shared/prisma";
import { checkRateLimit } from "@/backend/shared/rateLimit";
import { Role } from "@prisma/client";

// RFC 5322 compliant simple email validator
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export async function POST(req: Request) {
  try {
    // 1. Rate limiting by IP or forward header
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "anonymous";

    const rateLimit = await checkRateLimit(`register:${ip}`, 5, 15 * 60); // 5 attempts per 15 minutes
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

    // 2. Parse and validate payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { name, email, password, organizationName } = body;

    // Strict validation
    if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json(
        { error: "Full name must be between 2 and 100 characters" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim().toLowerCase())) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 8 and 128 characters" },
        { status: 400 }
      );
    }

    // Password complexity: at least one letter and one number
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain at least one letter and one number" },
        { status: 400 }
      );
    }

    if (
      !organizationName ||
      typeof organizationName !== "string" ||
      organizationName.trim().length < 2 ||
      organizationName.trim().length > 100
    ) {
      return NextResponse.json(
        { error: "Organization name must be between 2 and 100 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedOrgName = organizationName.trim();

    // 3. Atomically create Org, User, and Membership (strictly ORG_ADMIN) in an isolated transaction
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      // Check existing email inside transaction
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }

      // Create Organization
      const org = await tx.org.create({
        data: {
          name: trimmedOrgName,
        },
      });

      // Create User
      const user = await tx.user.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          passwordHash,
        },
      });

      // Create Membership - NEVER accept client-supplied role or tenant ID; strictly ORG_ADMIN
      await tx.membership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: Role.ORG_ADMIN,
        },
      });

      // Append immutable audit log
      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorId: user.id,
          action: "org.registered",
          entityType: "Org",
          entityId: org.id,
          metadata: {
            orgName: org.name,
            creatorEmail: user.email,
          },
        },
      });

      return { user, org };
    }, {
      maxWait: 15000,
      timeout: 20000,
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          org: {
            id: result.org.id,
            name: result.org.name,
          },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.message === "EMAIL_ALREADY_EXISTS" || error?.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email address already exists" },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
