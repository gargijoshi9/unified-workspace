import NextAuth, { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/shared/prisma";
import { redis } from "@/backend/shared/redis";

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
                    memberships: user.memberships.map((m) => ({
                        orgId: m.orgId,
                        orgName: m.org.name,
                        role: m.role,
                    })),
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // First login: attach memberships + default active org to the token
            if (user) {
                token.id = user.id;
                token.memberships = user.memberships;
                token.activeOrgId = user.memberships?.[0]?.orgId ?? null;

                try {
                    const redisKey = `user:session-version:${user.id}`;
                    let currentVersion = await redis.get(redisKey);
                    if (!currentVersion) {
                        currentVersion = "1";
                        await redis.set(redisKey, currentVersion);
                    }
                    token.sessionVersion = currentVersion;
                } catch (e) {
                    console.error("Redis error during login token version init:", e);
                    token.sessionVersion = "1";
                }
            }

            // Handle org switch trigger from client
            if (trigger === "update" && session?.activeOrgId) {
                token.activeOrgId = session.activeOrgId;
            }

            // Check if token has been revoked by comparing with Redis session version
            if (token.id) {
                try {
                    const redisKey = `user:session-version:${token.id}`;
                    const currentVersion = await redis.get(redisKey);
                    if (currentVersion && token.sessionVersion !== currentVersion) {
                        token.revoked = true;
                    }
                } catch (e) {
                    console.error("Redis error during jwt verification:", e);
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (token?.revoked) {
                return {
                    ...session,
                    user: null as unknown as typeof session.user,
                    error: "RevokedSession",
                } as unknown as Session;
            }
            // Expose id, memberships, active org to the client via useSession()
            if (token?.id) {
                session.user.id = token.id as string;
            }
            if (token?.memberships) {
                session.user.memberships = token.memberships as typeof session.user.memberships;
            }
            if (token?.activeOrgId !== undefined) {
                session.user.activeOrgId = token.activeOrgId as string | null;
            }
            return session;
        },
    },
    events: {
        async signOut(message) {
            try {
                const token = (message as { token?: { id?: string } }).token;
                if (token?.id) {
                    const redisKey = `user:session-version:${token.id}`;
                    await redis.incr(redisKey);
                    console.log(`[Logout-Everywhere] Incremented session version for user ${token.id}`);
                }
            } catch (error) {
                console.error("Error updating session version in Redis during signOut:", error);
            }
        }
    },
    pages: {
        signIn: "/login",
    },
});