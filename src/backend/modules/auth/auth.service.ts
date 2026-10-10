import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/shared/prisma";
import { handleJwtCallback } from "./jwt";
import { handleSessionCallback, handleSignOutEvent } from "./session";

// Separated credentials validation business logic
export async function validateCredentials(credentials: Record<string, unknown>) {
  if (!credentials?.email || !credentials?.password) return null;

  const normalizedEmail = String(credentials.email).trim().toLowerCase();
  const password = String(credentials.password);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: { include: { org: true } },
    },
  });

  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;

  // Attach memberships so we can pick default org + role
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    memberships: user.memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };
}

const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        return validateCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    jwt: handleJwtCallback,
    session: handleSessionCallback,
  },
  events: {
    signOut: handleSignOutEvent,
  },
  pages: {
    signIn: "/login",
  },
});

let testSessionOverride: any = undefined;

/**
 * Test helper to simulate sessions in server-side test suites.
 * STRICT SECURITY GUARD: Rejects execution if NODE_ENV === 'production'.
 */
export function setTestSession(session: any) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Security Violation: Test session injection is strictly forbidden in production");
  }
  testSessionOverride = session;
}

export const { handlers, signIn, signOut } = nextAuth;

export const auth = (async (...args: any[]) => {
  if (process.env.NODE_ENV !== "production" && testSessionOverride !== undefined && (args.length === 0 || typeof args[0] !== "function")) {
    return testSessionOverride;
  }
  return (nextAuth.auth as any)(...args);
}) as typeof nextAuth.auth;

export type { Session } from "next-auth";
