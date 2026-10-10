import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { redis } from "../src/backend/shared/redis";
import { validateCredentials, setTestSession, auth } from "../src/backend/modules/auth/auth.service";
import { POST as registerHandler } from "../app/api/auth/register/route";
import { POST as recoveryRequestHandler } from "../app/api/auth/recovery/request/route";
import { POST as recoveryResetHandler } from "../app/api/auth/recovery/reset/route";
import { getTickets } from "../src/backend/modules/ticket/ticketsController";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function createJsonRequest(url: string, body: any): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

async function runAuthSecurityTests() {
  console.log("🔐 Starting Phase 1 Authentication & Security Hardening Regression Suite...\n");

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

  const testSuffix = Date.now().toString().slice(-6);
  const testEmail = `sec-test-${testSuffix}@example.com`;
  const testPassword = "SecurePass123!";
  const testName = "Security Auditor";
  const testOrgName = `Audited Corp ${testSuffix}`;

  let createdUserId: string | null = null;
  let createdOrgId: string | null = null;

  try {
    // =========================================================================
    // SUITE 1: Secure Registration & Input Validation
    // =========================================================================
    console.log("📌 SUITE 1: Secure Registration & Input Validation");

    // 1.1 Invalid input: Short password
    const shortPassRes = await registerHandler(
      createJsonRequest("http://localhost/api/auth/register", {
        name: testName,
        email: testEmail,
        password: "short",
        organizationName: testOrgName,
      })
    );
    assert(
      shortPassRes.status === 400,
      "Rejects registration with password shorter than 8 characters (HTTP 400)"
    );

    // 1.2 Invalid input: Password without number
    const noNumPassRes = await registerHandler(
      createJsonRequest("http://localhost/api/auth/register", {
        name: testName,
        email: testEmail,
        password: "NoNumbersInThisPassword",
        organizationName: testOrgName,
      })
    );
    assert(
      noNumPassRes.status === 400,
      "Rejects password lacking number requirement (HTTP 400)"
    );

    // 1.3 Invalid input: Invalid email format
    const badEmailRes = await registerHandler(
      createJsonRequest("http://localhost/api/auth/register", {
        name: testName,
        email: "not-an-email",
        password: testPassword,
        organizationName: testOrgName,
      })
    );
    assert(
      badEmailRes.status === 400,
      "Rejects malformed email address format (HTTP 400)"
    );

    // 1.4 Successful registration
    const validRegRes = await registerHandler(
      createJsonRequest("http://localhost/api/auth/register", {
        name: testName,
        email: testEmail,
        password: testPassword,
        organizationName: testOrgName,
        // Attempt privilege escalation: client tries to pass illegal role & fake tenant
        role: "PLATFORM_SUPER_ADMIN",
        orgId: "malicious-org-id",
      })
    );
    assert(
      validRegRes.status === 201,
      "Registers new organization and user atomically (HTTP 201)"
    );

    const regData = await validRegRes.json();
    assert(
      regData.success === true && regData.user?.email === testEmail.toLowerCase(),
      "Registration returns normalized email in user payload"
    );
    assert(
      regData.user?.passwordHash === undefined && regData.user?.password === undefined,
      "Registration response strictly NEVER exposes password or passwordHash"
    );

    createdUserId = regData.user?.id;
    createdOrgId = regData.user?.org?.id;

    // 1.5 Duplicate email registration rejection
    const dupRegRes = await registerHandler(
      createJsonRequest("http://localhost/api/auth/register", {
        name: "Another Name",
        email: testEmail.toUpperCase(), // Test case-insensitive duplicate rejection
        password: testPassword,
        organizationName: "Another Org",
      })
    );
    assert(
      dupRegRes.status === 409,
      "Rejects duplicate email registration with 409 Conflict (case-insensitive)"
    );

    console.log("");

    // =========================================================================
    // SUITE 2: Storage Integrity & Privilege Escalation Defense
    // =========================================================================
    console.log("📌 SUITE 2: Storage Integrity & Privilege Escalation Defense");

    // 2.1 Passwords stored ONLY as hashes
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId! },
      include: { memberships: true },
    });

    assert(!!dbUser, "User persisted in PostgreSQL database");
    assert(
      Boolean(dbUser?.passwordHash?.startsWith("$2")),
      "Password stored exclusively as standard bcrypt hash ($2)"
    );
    assert(
      dbUser?.passwordHash !== testPassword,
      "Plaintext password is never persisted in database"
    );

    // 2.2 Privilege Escalation Check: Role locked strictly to ORG_ADMIN
    assert(
      dbUser?.memberships.length === 1 && dbUser.memberships[0].role === Role.ORG_ADMIN,
      "Client privilege escalation payload completely ignored: User role strictly assigned as ORG_ADMIN"
    );
    assert(
      dbUser?.memberships[0].orgId === createdOrgId,
      "User membership belongs exclusively to their newly created organization"
    );

    console.log("");

    // =========================================================================
    // SUITE 3: Sign-In with Validated Credentials & Case Normalization
    // =========================================================================
    console.log("📌 SUITE 3: Sign-In Authentication & Generic Error Defense");

    // 3.1 Sign in with exact credentials
    const authResult = await validateCredentials({
      email: testEmail,
      password: testPassword,
    });
    assert(
      authResult !== null && authResult.id === createdUserId,
      "Authenticates newly registered user with correct credentials"
    );

    // 3.2 Sign in with mixed-case email (normalization check)
    const mixedCaseAuth = await validateCredentials({
      email: testEmail.toUpperCase(),
      password: testPassword,
    });
    assert(
      mixedCaseAuth !== null && mixedCaseAuth.id === createdUserId,
      "Authenticates with normalized email address regardless of input casing"
    );

    // 3.3 Sign in with incorrect password returns null (generic error)
    const wrongPassAuth = await validateCredentials({
      email: testEmail,
      password: "WrongPassword123",
    });
    assert(
      wrongPassAuth === null,
      "Rejects authentication with invalid password (generic null response)"
    );

    // 3.4 Sign in with non-existent email returns null
    const nonExistentAuth = await validateCredentials({
      email: "non-existent-user-999@example.com",
      password: "SomePassword123",
    });
    assert(
      nonExistentAuth === null,
      "Rejects non-existent email without leaking account existence"
    );

    console.log("");

    // =========================================================================
    // SUITE 4: Production Rejection of Test-Session Injection
    // =========================================================================
    console.log("📌 SUITE 4: Production Rejection of setTestSession");

    const originalEnv = process.env.NODE_ENV;
    try {
      // Simulate production environment
      (process.env as any).NODE_ENV = "production";

      let threwInProd = false;
      try {
        setTestSession({
          user: {
            id: "injected-id",
            name: "Hacker",
            email: "hacker@evil.com",
            activeOrgId: "injected-org",
            memberships: [],
          },
          expires: "2099-01-01",
        } as any);
      } catch (err: any) {
        threwInProd = err.message.includes("Security Violation");
      }

      assert(
        threwInProd,
        "Calling setTestSession in production environment throws Security Violation exception"
      );
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }

    console.log("");

    // =========================================================================
    // SUITE 5: Unauthenticated and Revoked Session Access Protection
    // =========================================================================
    console.log("📌 SUITE 5: Session Invalidation & Protected Endpoint Guard");

    // 5.1 Unauthenticated access returns 401
    setTestSession(null);
    const unauthRes = await getTickets();
    assert(
      unauthRes.status === 401,
      "Protected controller rejects unauthenticated requests with HTTP 401"
    );

    // 5.2 Revoked session returns 401
    setTestSession({
      user: null as any,
      expires: "2099-01-01",
      error: "RevokedSession",
    } as any);
    const revokedRes = await getTickets();
    assert(
      revokedRes.status === 401,
      "Protected controller rejects revoked sessions with HTTP 401"
    );

    // Reset test session
    setTestSession(undefined);

    console.log("");

    // =========================================================================
    // SUITE 6: Account Recovery & Password Reset Security
    // =========================================================================
    console.log("📌 SUITE 6: Account Recovery & Password Reset Security");

    // 6.1 Recovery request does not leak whether account exists
    const fakeRecoveryRes = await recoveryRequestHandler(
      createJsonRequest("http://localhost/api/auth/recovery/request", {
        email: "completely-unknown@nowhere.com",
      })
    );
    const fakeRecoveryData = await fakeRecoveryRes.json();
    assert(
      fakeRecoveryRes.status === 200 &&
        fakeRecoveryData.message.includes("If an account with that email exists"),
      "Recovery request returns identical generic message for non-existent email"
    );

    const realRecoveryRes = await recoveryRequestHandler(
      createJsonRequest("http://localhost/api/auth/recovery/request", {
        email: testEmail,
      })
    );
    const realRecoveryData = await realRecoveryRes.json();
    assert(
      realRecoveryRes.status === 200 &&
        realRecoveryData.message === fakeRecoveryData.message,
      "Recovery request returns identical message for existing email (no enumeration)"
    );

    // 6.2 Token generation & Reset execution via secure hashed token
    const testRawToken = crypto.randomBytes(32).toString("hex");
    const testTokenHash = crypto.createHash("sha256").update(testRawToken).digest("hex");
    const testRedisKey = `password-reset:${testTokenHash}`;

    await redis.set(testRedisKey, createdUserId!, "EX", 900);

    const resetRes = await recoveryResetHandler(
      createJsonRequest("http://localhost/api/auth/recovery/reset", {
        token: testRawToken,
        newPassword: "UpdatedSecurePassword456!",
      })
    );
    assert(
      resetRes.status === 200,
      "Password reset succeeds with valid single-use token"
    );

    // 6.3 Token single-use consumption check
    const tokenInRedisAfter = await redis.get(testRedisKey);
    assert(
      tokenInRedisAfter === null,
      "Reset token is immediately deleted and cannot be reused"
    );

    // 6.4 Authenticate with updated password
    const newPassAuth = await validateCredentials({
      email: testEmail,
      password: "UpdatedSecurePassword456!",
    });
    assert(
      newPassAuth !== null && newPassAuth.id === createdUserId,
      "User can authenticate with newly updated password"
    );

    // Old password no longer works
    const oldPassAuth = await validateCredentials({
      email: testEmail,
      password: testPassword,
    });
    assert(
      oldPassAuth === null,
      "Old password is invalidated immediately"
    );

  } finally {
    // Clean up test fixtures
    console.log("\n🧹 Cleaning up test fixtures from database...");
    if (createdUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: createdUserId } });
      await prisma.membership.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    if (createdOrgId) {
      await prisma.auditLog.deleteMany({ where: { orgId: createdOrgId } });
      await prisma.org.deleteMany({ where: { id: createdOrgId } });
    }
    console.log("  ℹ️ Cleanup complete.");
  }

  console.log("\n=================================================================");
  console.log(`📊 Phase 1 Security Suite Summary: ${passed} Passed, ${failed} Failed.`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuthSecurityTests()
  .catch((err) => {
    console.error("❌ Fatal error in auth security test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
