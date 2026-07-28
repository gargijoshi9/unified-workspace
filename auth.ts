import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
    session: { strategy: "jwt" },
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
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
                    memberships: user.memberships.map((m: any) => ({
                        orgId: m.orgId,
                        orgName: m.org.name,
                        role: m.role,
                    })),
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            // First login: attach memberships + default active org to the token
            if (user) {
                token.id = user.id;
                token.memberships = (user as any).memberships;
                token.activeOrgId = (user as any).memberships[0]?.orgId ?? null;
            }
            return token;
        },
        async session({ session, token }) {
            // Expose id, memberships, active org to the client via useSession()
            (session.user as any).id = token.id;
            (session.user as any).memberships = token.memberships;
            (session.user as any).activeOrgId = token.activeOrgId;
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
});