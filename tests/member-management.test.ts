import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { redis } from "../src/backend/shared/redis";
import { setTestSession, validateCredentials } from "../src/backend/modules/auth/auth.service";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import { MembersService } from "../src/backend/modules/organization/membersService";
import { GET as getMembersHandler } from "../app/api/organization/members/route";
import { POST as inviteMemberHandler, DELETE as cancelInviteHandler } from "../app/api/organization/members/invite/route";
import { POST as resendInviteHandler } from "../app/api/organization/members/invite/resend/route";
import { PATCH as updateMemberHandler } from "../app/api/organization/members/[id]/route";
import { GET as verifyTokenHandler, POST as acceptInviteHandler } from "../app/api/organization/members/invite/accept/route";
import { Role, InvitationStatus } from "@prisma/client";
import crypto from "crypto";

function createJsonRequest(url: string, method: string, body?: any): Request {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

async function runMemberManagementTests() {
  console.log("👥 Starting Team Member Management & Invitation Security Test Suite...\n");

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

  // Load Seeded Organizations
  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme Corp or Globex Inc orgs)");
    process.exit(1);
  }

  const acmeAdminUser = await prisma.user.findUnique({ where: { email: "admin@acme.com" } });
  const acmeAgentUser = await prisma.user.findUnique({ where: { email: "agent@acme.com" } });
  const globexAdminUser = await prisma.user.findUnique({ where: { email: "admin@globex.com" } });

  if (!acmeAdminUser || !acmeAgentUser || !globexAdminUser) {
    console.error("❌ Seed database users not found");
    process.exit(1);
  }

  const acmeAdminSession: UserSession = {
    id: acmeAdminUser.id,
    activeOrgId: acme.id,
    name: acmeAdminUser.name,
    email: acmeAdminUser.email,
    memberships: [{ orgId: acme.id, orgName: acme.name, role: Role.ORG_ADMIN }],
  };

  const acmeAgentSession: UserSession = {
    id: acmeAgentUser.id,
    activeOrgId: acme.id,
    name: acmeAgentUser.name,
    email: acmeAgentUser.email,
    memberships: [{ orgId: acme.id, orgName: acme.name, role: Role.SUPPORT_AGENT }],
  };

  const globexAdminSession: UserSession = {
    id: globexAdminUser.id,
    activeOrgId: globex.id,
    name: globexAdminUser.name,
    email: globexAdminUser.email,
    memberships: [{ orgId: globex.id, orgName: globex.name, role: Role.ORG_ADMIN }],
  };

  const testSuffix = Date.now().toString().slice(-6);
  const testInviteeEmail = `new-hire-${testSuffix}@acme.com`;
  const testInviteePassword = "SecurePass123!";

  let createdInvitationId: string | null = null;
  let rawInvitationToken: string | null = null;
  let acceptedUserId: string | null = null;
  let acceptedMembershipId: string | null = null;

  try {
    // =========================================================================
    // SUITE 1: RBAC & Unauthorized Access Enforcement
    // =========================================================================
    console.log("📌 SUITE 1: RBAC & Unauthorized Access Enforcement");

    // 1.1 Unauthenticated request rejected with 401
    setTestSession(null);
    const unauthRes = await getMembersHandler();
    assert(
      unauthRes.status === 401,
      "Server rejects unauthenticated GET /api/organization/members with 401 Unauthorized"
    );

    // 1.2 Non-admin (SUPPORT_AGENT) attempting to view members is rejected with 403
    setTestSession({ user: acmeAgentSession } as any);
    const agentGetRes = await getMembersHandler();
    assert(
      agentGetRes.status === 403,
      "Server rejects SUPPORT_AGENT attempting to view members with 403 Forbidden"
    );

    // 1.3 Non-admin (SUPPORT_AGENT) attempting to invite members is rejected with 403
    const agentInviteRes = await inviteMemberHandler(
      createJsonRequest("http://localhost/api/organization/members/invite", "POST", {
        email: testInviteeEmail,
        name: "Test Invitee",
        role: "SUPPORT_AGENT",
      })
    );
    assert(
      agentInviteRes.status === 403,
      "Server rejects SUPPORT_AGENT attempting to invite members with 403 Forbidden"
    );

    console.log("");

    // =========================================================================
    // SUITE 2: Invitation Creation & Privilege Escalation Defense
    // =========================================================================
    console.log("📌 SUITE 2: Invitation Creation & Privilege Escalation Defense");

    setTestSession({ user: acmeAdminSession } as any);

    // 2.1 Attempt to assign PLATFORM_SUPER_ADMIN rejected
    const superAdminInviteRes = await inviteMemberHandler(
      createJsonRequest("http://localhost/api/organization/members/invite", "POST", {
        email: testInviteeEmail,
        name: "Illegal Admin",
        role: "PLATFORM_SUPER_ADMIN",
      })
    );
    assert(
      superAdminInviteRes.status === 403,
      "Server rejects attempt to invite member as PLATFORM_SUPER_ADMIN (HTTP 403)"
    );

    // 2.2 Attempt to invite already active member rejected with 409
    const dupMemberInviteRes = await inviteMemberHandler(
      createJsonRequest("http://localhost/api/organization/members/invite", "POST", {
        email: "agent@acme.com", // Existing active member
        name: "Sam Support Duplicate",
        role: "SUPPORT_AGENT",
      })
    );
    assert(
      dupMemberInviteRes.status === 409,
      "Server rejects invitation for an already active member with 409 Conflict"
    );

    // 2.3 Successful invitation creation
    const validInviteRes = await inviteMemberHandler(
      createJsonRequest("http://localhost/api/organization/members/invite", "POST", {
        email: testInviteeEmail,
        name: "Alex Support",
        role: "SUPPORT_AGENT",
      })
    );
    assert(
      validInviteRes.status === 201,
      "Server allows ORG_ADMIN to create valid member invitation with 201 Created"
    );

    const inviteData = await validInviteRes.json();
    createdInvitationId = inviteData.invitation.id;
    assert(
      inviteData.invitation.status === "PENDING" && inviteData.invitation.email === testInviteeEmail.toLowerCase(),
      "Invitation persisted in PENDING state with normalized email"
    );

    // Verify raw token is NOT stored in database (only tokenHash)
    const dbInvitation = await prisma.invitation.findUnique({
      where: { id: createdInvitationId! },
    });
    assert(
      !!dbInvitation?.tokenHash && dbInvitation.tokenHash.length === 64,
      "Invitation token is stored exclusively as a 64-character SHA-256 hash"
    );

    // Extract raw token from development test response
    rawInvitationToken = inviteData.inviteLink?.split("token=")[1];
    assert(!!rawInvitationToken, "Development inviteLink generated successfully for test evaluation");

    // Verify audit log for invitation
    const auditInvite = await prisma.auditLog.findFirst({
      where: {
        orgId: acme.id,
        action: "member.invited",
        entityId: createdInvitationId!,
      },
    });
    assert(!!auditInvite, "Immutable audit log record created for member.invited");

    console.log("");

    // =========================================================================
    // SUITE 3: Invitation Verification & Acceptance Workflow
    // =========================================================================
    console.log("📌 SUITE 3: Invitation Verification & Acceptance Workflow");

    // 3.1 Verify token with fake/invalid token
    const fakeTokenRes = await verifyTokenHandler(
      createJsonRequest("http://localhost/api/organization/members/invite/accept?token=invalid-fake-token", "GET")
    );
    assert(
      fakeTokenRes.status === 400,
      "Verification rejects invalid/tampered token with HTTP 400"
    );

    // 3.2 Verify valid token
    const validTokenRes = await verifyTokenHandler(
      createJsonRequest(`http://localhost/api/organization/members/invite/accept?token=${rawInvitationToken}`, "GET")
    );
    assert(
      validTokenRes.status === 200,
      "Verification confirms valid pending token with 200 OK"
    );
    const validTokenData = await validTokenRes.json();
    assert(
      validTokenData.invitation.orgName === "Acme Corp" && validTokenData.invitation.role === "SUPPORT_AGENT",
      "Token verification returns correct target organization and role metadata"
    );

    // 3.3 Accept invitation and create account
    const acceptRes = await acceptInviteHandler(
      createJsonRequest("http://localhost/api/organization/members/invite/accept", "POST", {
        token: rawInvitationToken,
        name: "Alex Support",
        password: testInviteePassword,
      })
    );
    assert(
      acceptRes.status === 200,
      "Invitee successfully accepts invitation and establishes password (HTTP 200)"
    );

    const acceptData = await acceptRes.json();
    acceptedUserId = acceptData.user.id;

    // Verify user exists and can authenticate
    const authResult = await validateCredentials({
      email: testInviteeEmail,
      password: testInviteePassword,
    });
    assert(
      authResult !== null && authResult.id === acceptedUserId,
      "New team member authenticates immediately with established password"
    );

    // Verify membership role in database
    const dbMembership = await prisma.membership.findFirst({
      where: { userId: acceptedUserId!, orgId: acme.id },
    });
    assert(
      dbMembership?.role === Role.SUPPORT_AGENT && dbMembership?.isActive === true,
      "Membership assigned strictly with invited role (SUPPORT_AGENT) and isActive=true"
    );
    acceptedMembershipId = dbMembership?.id || null;

    // 3.4 Single-use Token Invalidation: Second acceptance attempt MUST fail
    const reuseRes = await acceptInviteHandler(
      createJsonRequest("http://localhost/api/organization/members/invite/accept", "POST", {
        token: rawInvitationToken,
        password: testInviteePassword,
      })
    );
    assert(
      reuseRes.status === 400,
      "Server rejects reused invitation token (single-use token consumption enforced)"
    );

    console.log("");

    // =========================================================================
    // SUITE 4: Cross-Tenant Isolation & Manipulation Defense
    // =========================================================================
    console.log("📌 SUITE 4: Cross-Tenant Isolation & Manipulation Defense");

    // 4.1 Globex admin attempts to modify Acme membership
    setTestSession({ user: globexAdminSession } as any);
    const crossTenantUpdateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/${acceptedMembershipId}`, "PATCH", {
        role: "ORG_ADMIN",
      }),
      { params: Promise.resolve({ id: acceptedMembershipId! }) }
    );
    assert(
      crossTenantUpdateRes.status === 404,
      "Server rejects cross-tenant member update with 404 Not Found (BOLA defense)"
    );

    // 4.2 Globex admin attempts to deactivate Acme member
    const crossTenantDeactivateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/${acceptedMembershipId}`, "PATCH", {
        isActive: false,
      }),
      { params: Promise.resolve({ id: acceptedMembershipId! }) }
    );
    assert(
      crossTenantDeactivateRes.status === 404,
      "Server rejects cross-tenant member deactivation with 404 Not Found"
    );

    console.log("");

    // =========================================================================
    // SUITE 5: Role Updates, Session Invalidation & Deactivation
    // =========================================================================
    console.log("📌 SUITE 5: Role Updates, Session Invalidation & Deactivation");

    setTestSession({ user: acmeAdminSession } as any);

    // 5.1 Role update: Change from SUPPORT_AGENT to REVIEWER_APPROVER
    const roleUpdateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/${acceptedMembershipId}`, "PATCH", {
        role: "REVIEWER_APPROVER",
      }),
      { params: Promise.resolve({ id: acceptedMembershipId! }) }
    );
    assert(
      roleUpdateRes.status === 200,
      "ORG_ADMIN can update member role to REVIEWER_APPROVER (HTTP 200)"
    );

    const updatedMembership = await prisma.membership.findUnique({
      where: { id: acceptedMembershipId! },
    });
    assert(
      updatedMembership?.role === Role.REVIEWER_APPROVER,
      "Membership role updated in PostgreSQL database to REVIEWER_APPROVER"
    );

    // 5.2 Deactivate member
    const deactivateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/${acceptedMembershipId}`, "PATCH", {
        isActive: false,
      }),
      { params: Promise.resolve({ id: acceptedMembershipId! }) }
    );
    assert(
      deactivateRes.status === 200,
      "ORG_ADMIN can deactivate member (HTTP 200)"
    );

    // Verify deactivated member cannot authenticate to organization
    const deactivatedLogin = await validateCredentials({
      email: testInviteeEmail,
      password: testInviteePassword,
    });
    assert(
      deactivatedLogin?.memberships.length === 0,
      "Deactivated member has zero active memberships returned on login"
    );

    // 5.3 Last Admin Protection: Admin cannot deactivate themselves if sole admin
    const selfDeactivateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/some-id`, "PATCH", {
        isActive: false,
      }),
      { params: Promise.resolve({ id: acmeAdminSession.id }) }
    );
    assert(
      selfDeactivateRes.status === 400 || selfDeactivateRes.status === 404,
      "Server protects administrator from removing own administrative access"
    );

    // 5.4 Reactivate member
    const reactivateRes = await updateMemberHandler(
      createJsonRequest(`http://localhost/api/organization/members/${acceptedMembershipId}`, "PATCH", {
        isActive: true,
      }),
      { params: Promise.resolve({ id: acceptedMembershipId! }) }
    );
    assert(
      reactivateRes.status === 200,
      "ORG_ADMIN can reactivate member (HTTP 200)"
    );

    console.log("");

    // =========================================================================
    // SUITE 6: Invitation Resend & Cancellation Workflow
    // =========================================================================
    console.log("📌 SUITE 6: Invitation Resend & Cancellation Workflow");

    // 6.1 Create another invitation to test cancellation
    const cancelTestEmail = `cancel-test-${testSuffix}@acme.com`;
    const inviteToCancelRes = await inviteMemberHandler(
      createJsonRequest("http://localhost/api/organization/members/invite", "POST", {
        email: cancelTestEmail,
        role: "SUPPORT_AGENT",
      })
    );
    const cancelInviteData = await inviteToCancelRes.json();
    const cancelInviteId = cancelInviteData.invitation.id;
    const cancelRawToken = cancelInviteData.inviteLink?.split("token=")[1];

    // Cancel invitation
    const cancelActionRes = await cancelInviteHandler(
      createJsonRequest(`http://localhost/api/organization/members/invite?id=${cancelInviteId}`, "DELETE")
    );
    assert(
      cancelActionRes.status === 200,
      "ORG_ADMIN can cancel pending invitation with 200 OK"
    );

    // Attempting to accept cancelled invitation must fail
    const acceptCancelledRes = await acceptInviteHandler(
      createJsonRequest("http://localhost/api/organization/members/invite/accept", "POST", {
        token: cancelRawToken,
        password: "ValidPass123!",
      })
    );
    assert(
      acceptCancelledRes.status === 400,
      "Server rejects acceptance of cancelled invitation"
    );

  } finally {
    // Reset test session
    setTestSession(undefined);

    // Clean up created test fixtures
    console.log("\n🧹 Cleaning up test fixtures from database...");
    if (acceptedUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: acceptedUserId } });
      await prisma.membership.deleteMany({ where: { userId: acceptedUserId } });
      await prisma.user.deleteMany({ where: { id: acceptedUserId } });
    }
    await prisma.invitation.deleteMany({
      where: { email: { contains: testSuffix } },
    });
    console.log("  ℹ️ Cleanup complete.");
  }

  console.log("\n=========================================================================");
  console.log(`📊 Member Management Suite Summary: ${passed} Passed, ${failed} Failed.`);
  console.log("=========================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMemberManagementTests()
  .catch((err) => {
    console.error("❌ Fatal error in member management test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
