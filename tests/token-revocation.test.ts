import "dotenv/config";
import { validateCredentials } from "../src/backend/modules/auth/auth.service";
import { handleJwtCallback } from "../src/backend/modules/auth/jwt";
import { handleSessionCallback, handleSignOutEvent } from "../src/backend/modules/auth/session";
import { redis } from "../src/backend/shared/redis";
import { TicketsService } from "../src/backend/modules/ticket/ticketsService";
import { PRsService } from "../src/backend/modules/pr/prsService";
import { AuditService } from "../src/backend/modules/audit/auditService";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";

async function loginAndIssueJwt(email: string) {
  const user = await validateCredentials({ email, password: "password123" });
  if (!user) throw new Error(`Authentication failed for ${email}`);

  // Create & issue JWT via NextAuth JWT Callback
  let token: JWT = {};
  token = await handleJwtCallback({ token, user: user as any });

  return { user, token };
}

async function verifyAndResolveSession(token: JWT): Promise<UserSession | null> {
  // Pass token through JWT Callback to verify revocation status against Redis
  const verifiedToken = await handleJwtCallback({ token: { ...token } });

  if (verifiedToken.revoked) {
    return null;
  }

  const baseSession: Session = {
    user: { id: "", email: "", name: "", image: "" },
    expires: new Date(Date.now() + 86400 * 1000).toISOString(),
  };

  const session = await handleSessionCallback({ session: baseSession, token: verifiedToken });

  if ((session as any).error === "RevokedSession" || !session.user || !session.user.activeOrgId) {
    return null;
  }

  return session.user as UserSession;
}

// Simulates API Protected Endpoint Request
async function accessProtectedEndpoint(token: JWT, endpoint: "/api/tickets" | "/api/prs" | "/api/audit") {
  const sessionUser = await verifyAndResolveSession(token);

  if (!sessionUser) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  try {
    if (endpoint === "/api/tickets") {
      const tickets = await TicketsService.getTickets(sessionUser);
      return { status: 200, body: { tickets } };
    } else if (endpoint === "/api/prs") {
      const prs = await PRsService.getPRs(sessionUser);
      return { status: 200, body: { prs } };
    } else if (endpoint === "/api/audit") {
      const audit = await AuditService.getAuditLogs(sessionUser, sessionUser.activeOrgId);
      if ("error" in audit) return { status: 403, body: { error: audit.error } };
      return { status: 200, body: audit };
    }
    return { status: 404, body: { error: "Not Found" } };
  } catch (err) {
    return { status: 500, body: { error: "Internal Server Error" } };
  }
}

async function runTokenRevocationTests() {
  console.log("🚀 Starting Token Revocation & Lifecycle Test Suite...\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Step 1: Login & Issue JWT ---
  console.log("📌 Step 1: Login & Issue JWT");
  const { token: originalJwt } = await loginAndIssueJwt("admin@acme.com");
  assert(!!originalJwt.id && !!originalJwt.sessionVersion, "JWT issued successfully with user ID and session version");

  // Keep a copy of the original issued JWT for reuse attempts
  const stolenOrReusedJwt = { ...originalJwt };

  console.log("");

  // --- Step 2: Access Protected Endpoints with Valid JWT ---
  console.log("📌 Step 2: Access Protected Endpoint (Before Logout)");
  const ticketsResBefore = await accessProtectedEndpoint(stolenOrReusedJwt, "/api/tickets");
  assert(
    ticketsResBefore.status === 200,
    `Protected Endpoint /api/tickets returns 200 OK before logout (Got HTTP ${ticketsResBefore.status})`
  );

  const prsResBefore = await accessProtectedEndpoint(stolenOrReusedJwt, "/api/prs");
  assert(
    prsResBefore.status === 200,
    `Protected Endpoint /api/prs returns 200 OK before logout (Got HTTP ${prsResBefore.status})`
  );

  console.log("");

  // --- Step 3: Logout Event ---
  console.log("📌 Step 3: Perform Logout");
  await handleSignOutEvent({ token: originalJwt });
  console.log("  ℹ️ Logout event fired, Redis session version incremented.");

  console.log("");

  // --- Step 4: Attempt to Reuse Old JWT ---
  console.log("📌 Step 4: Attempt to Reuse Old Issued JWT (After Logout)");
  const ticketsResAfter = await accessProtectedEndpoint(stolenOrReusedJwt, "/api/tickets");
  assert(
    ticketsResAfter.status === 401,
    `Protected Endpoint /api/tickets rejects reused JWT and returns 401 Unauthorized (Got HTTP ${ticketsResAfter.status})`
  );

  const prsResAfter = await accessProtectedEndpoint(stolenOrReusedJwt, "/api/prs");
  assert(
    prsResAfter.status === 401,
    `Protected Endpoint /api/prs rejects reused JWT and returns 401 Unauthorized (Got HTTP ${prsResAfter.status})`
  );

  const auditResAfter = await accessProtectedEndpoint(stolenOrReusedJwt, "/api/audit");
  assert(
    auditResAfter.status === 401,
    `Protected Endpoint /api/audit rejects reused JWT and returns 401 Unauthorized (Got HTTP ${auditResAfter.status})`
  );

  console.log("\n==========================================");
  console.log(`📊 Lifecycle Results: ${passed} Passed, ${failed} Failed.`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTokenRevocationTests()
  .catch((err) => {
    console.error("❌ Fatal error in token revocation test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await redis.quit();
  });
