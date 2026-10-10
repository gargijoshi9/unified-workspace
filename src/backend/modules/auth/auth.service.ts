import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/shared/prisma";
import { handleJwtCallback } from "./jwt";
import { handleSessionCallback, handleSignOutEvent } from "./session";

// Separated credentials validation business logic
export async function validateCredentials(credentials: Record<string, unknown>) {
  if (!credentials?.email || !credentials?.password) return null;

  const user = await prisma.user.findUnique({
    where: { email: credentials.email as string },
    include: {
      memberships: { include: { org: true } },
    },
  });

  if (!user) return null;

  const isValid = await bcrypt.compare(
    credentials.password as string,
    user.passwordHash
  );
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

export const { handlers, signIn, signOut, auth } = NextAuth({
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
export type { Session } from "next-auth";
