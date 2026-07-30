import "dotenv/config";
import { validateCredentials } from "../src/backend/modules/auth/auth.service";
import { handleJwtCallback } from "../src/backend/modules/auth/jwt";
import { handleSessionCallback, handleSignOutEvent } from "../src/backend/modules/auth/session";
import { redis } from "../src/backend/shared/redis";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";

async function simulateLogin(email: string) {
  const user = await validateCredentials({ email, password: "password123" });
  if (!user) throw new Error(`Invalid credentials for ${email}`);

  // Create JWT token for initial login
  let token: JWT = {};
  token = await handleJwtCallback({ token, user: user as any });

  // Resolve session for user
  const baseSession: Session = {
    user: { id: "", email: "", name: "", image: "" },
    expires: new Date(Date.now() + 86400 * 1000).toISOString(),
  };

  const activeSession = await handleSessionCallback({ session: baseSession, token });
  return { user, token, session: activeSession };
}

async function validateSessionToken(token: JWT) {
  // Pass token through JWT callback (simulating NextAuth request validation)
  const updatedToken = await handleJwtCallback({ token: { ...token } });

  const baseSession: Session = {
    user: { id: "", email: "", name: "", image: "" },
    expires: new Date(Date.now() + 86400 * 1000).toISOString(),
  };

  const resolvedSession = await handleSessionCallback({ session: baseSession, token: updatedToken });

  if (updatedToken.revoked || (resolvedSession as any).error === "RevokedSession" || !resolvedSession.user) {
    return { status: 401, valid: false };
  }

  return { status: 200, valid: true, session: resolvedSession };
}

async function runSessionSyncTests() {
  console.log("🚀 Starting Session Synchronization Automated Test Suite...\n");

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

  // --- SCENARIO 1: Login & Access both dashboards ---
  console.log("📌 Scenario 1: Dual-Dashboard Access with Single Shared Session");
  const login1 = await simulateLogin("admin@acme.com");

  // Access Dashboard 1 (Support / Tickets Hub)
  const dash1Check = await validateSessionToken(login1.token);
  assert(dash1Check.status === 200 && dash1Check.valid, "Access Dashboard 1 (Support Hub) - Valid Session");

  // Access Dashboard 2 (Engineering / PRs Hub)
  const dash2Check = await validateSessionToken(login1.token);
  assert(dash2Check.status === 200 && dash2Check.valid, "Access Dashboard 2 (PRs Hub) - Valid Session");

  console.log("");

  // --- SCENARIO 2: Logout from Dashboard 1 immediately invalidates Dashboard 2 ---
  console.log("📌 Scenario 2: Logout from Dashboard 1 immediately revokes Dashboard 2");
  const login2 = await simulateLogin("agent@acme.com");

  // Verify initial access
  const agentDash1 = await validateSessionToken(login2.token);
  assert(agentDash1.valid, "Agent active on Dashboard 1 before logout");

  // Perform Logout on Dashboard 1 (triggers handleSignOutEvent)
  await handleSignOutEvent({ token: login2.token });

  // Attempt to access Dashboard 2 after logout
  const agentDash2AfterLogout = await validateSessionToken(login2.token);
  assert(
    agentDash2AfterLogout.status === 401 && !agentDash2AfterLogout.valid,
    "Dashboard 2 immediately returns 401 Unauthorized after Dashboard 1 logout"
  );

  console.log("");

  // --- SCENARIO 3: Multiple Active Sessions Invalidated on Logout ---
  console.log("📌 Scenario 3: Multiple Concurrent Sessions Revoked Globally on Sign Out");
  const userEmail = "reviewer@acme.com";

  // Simulate logging in from Desktop Browser (Session A)
  const sessionA = await simulateLogin(userEmail);
  // Simulate logging in from Mobile / Work Laptop (Session B)
  const sessionB = await simulateLogin(userEmail);

  // Both sessions should initially be valid
  const checkAInitial = await validateSessionToken(sessionA.token);
  const checkBInitial = await validateSessionToken(sessionB.token);
  assert(checkAInitial.valid && checkBInitial.valid, "Concurrent Session A and Session B both active and valid");

  // Sign out from Session A
  await handleSignOutEvent({ token: sessionA.token });

  // Verify Session A is revoked
  const checkARevoked = await validateSessionToken(sessionA.token);
  assert(checkARevoked.status === 401, "Session A returns 401 Unauthorized after sign out");

  // Verify Session B is also revoked globally
  const checkBRevoked = await validateSessionToken(sessionB.token);
  assert(checkBRevoked.status === 401, "Session B returns 401 Unauthorized globally after sign out from Session A");

  console.log("");

  // --- SCENARIO 4: Redis-Backed Session Versioning ---
  console.log("📌 Scenario 4: Redis-Backed Session Versioning Invalidation Mechanism");
  const userVersionTest = await simulateLogin("admin@acme.com");
  const userId = userVersionTest.user.id;
  const redisKey = `user:session-version:${userId}`;

  // Read current version in Redis
  const initialVersion = await redis.get(redisKey);
  assert(initialVersion !== null, "Redis stores current session version key");

  // Session with matching version is valid
  const versionCheckBefore = await validateSessionToken(userVersionTest.token);
  assert(versionCheckBefore.valid, "Session valid when token.sessionVersion matches Redis session version");

  // Manually increment Redis version (simulating remote session revocation trigger)
  await redis.incr(redisKey);
  const updatedVersion = await redis.get(redisKey);
  assert(Number(updatedVersion) > Number(initialVersion), `Redis session version incremented from ${initialVersion} to ${updatedVersion}`);

  // Old token with previous version must be rejected
  const versionCheckAfter = await validateSessionToken(userVersionTest.token);
  assert(
    versionCheckAfter.status === 401 && !versionCheckAfter.valid,
    "Old token with outdated sessionVersion invalidated via Redis check (Returns 401)"
  );

  console.log("\n==========================================");
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed.`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSessionSyncTests()
  .catch((err) => {
    console.error("❌ Fatal error in session sync test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await redis.quit();
  });
