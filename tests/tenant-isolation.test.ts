import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { setTestSession } from "../src/backend/modules/auth/auth.service";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import {
  getTicket,
  updateTicket,
  deleteTicket,
} from "../src/backend/modules/ticket/ticketsController";
import {
  getPR,
  updatePR,
  submitDecision,
} from "../src/backend/modules/pr/prsController";
import { PRStatus, Role, TicketStatus } from "@prisma/client";

function createRequest(method: string, url: string, body?: any): Request {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function getUserSession(email: string, activeOrgId?: string): Promise<UserSession> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found: ${email}`);

  const orgId = activeOrgId || user.memberships[0]?.orgId;
  if (!orgId) throw new Error(`User ${email} has no active organization membership`);

  return {
    id: user.id,
    activeOrgId: orgId,
    name: user.name,
    email: user.email,
    memberships: user.memberships.map((m: any) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };
}

async function runTenantIsolationTests() {
  console.log("🔒 Starting Multi-Tenant Isolation & Security Regression Test Suite...\n");

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

  // 1. Fetch Organizations
  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme Corp or Globex Inc orgs)");
    process.exit(1);
  }

  // 2. Fetch Users
  const acmeUser = await getUserSession("admin@acme.com", acme.id);
  const globexUser = await getUserSession("admin@globex.com", globex.id);

  // 3. Create Test Fixtures
  console.log("📦 Creating isolated test fixtures for Company A (Acme) and Company B (Globex)...");

  // Company B (Globex) Resources
  const globexTicket = await prisma.ticket.create({
    data: {
      orgId: globex.id,
      title: "Globex Proprietary Financial Forecast Q4",
      description: "Confidential financial data of Globex Inc.",
      createdById: globexUser.id,
      status: TicketStatus.OPEN,
    },
  });

  const globexPR = await prisma.pR.create({
    data: {
      orgId: globex.id,
      title: "Globex Kernel Security Module Fix",
      description: "Proprietary code review with internal infrastructure keys.",
      authorId: globexUser.id,
      status: PRStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  // Company A (Acme) Resources
  const acmeTicket = await prisma.ticket.create({
    data: {
      orgId: acme.id,
      title: "Acme Customer Delivery Schedule",
      description: "Regular delivery plan for Acme clients.",
      createdById: acmeUser.id,
      status: TicketStatus.OPEN,
    },
  });

  const acmePR = await prisma.pR.create({
    data: {
      orgId: acme.id,
      title: "Acme Web Portal Layout Revision",
      description: "Front-end changes for Acme dashboard.",
      authorId: acmeUser.id,
      status: PRStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  console.log("  ℹ️ Fixtures created successfully.\n");

  try {
    // =========================================================================
    // SUITE 1: Unauthenticated Requests (No Session / Rejected by Server)
    // =========================================================================
    console.log("🛡️  SUITE 1: Unauthenticated Requests Rejection by Server (HTTP 401)");
    setTestSession(null); // Explicitly simulate unauthenticated request

    // 1.1 Unauthenticated Read Ticket
    const unauthReadTicketRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${globexTicket.id}`),
      createParams(globexTicket.id)
    );
    assert(
      unauthReadTicketRes.status === 401,
      "Server rejects unauthenticated GET /api/tickets/[id] with 401 Unauthorized",
      `Got HTTP ${unauthReadTicketRes.status}`
    );

    // 1.2 Unauthenticated Write Ticket (PATCH)
    const unauthUpdateTicketRes = await updateTicket(
      createRequest("PATCH", `http://localhost/api/tickets/${globexTicket.id}`, { title: "Unauthenticated Tamper" }),
      createParams(globexTicket.id)
    );
    assert(
      unauthUpdateTicketRes.status === 401,
      "Server rejects unauthenticated PATCH /api/tickets/[id] with 401 Unauthorized",
      `Got HTTP ${unauthUpdateTicketRes.status}`
    );

    // 1.3 Unauthenticated Delete Ticket (DELETE)
    const unauthDeleteTicketRes = await deleteTicket(
      createRequest("DELETE", `http://localhost/api/tickets/${globexTicket.id}`),
      createParams(globexTicket.id)
    );
    assert(
      unauthDeleteTicketRes.status === 401,
      "Server rejects unauthenticated DELETE /api/tickets/[id] with 401 Unauthorized",
      `Got HTTP ${unauthDeleteTicketRes.status}`
    );

    // 1.4 Unauthenticated Read Code-Review PR
    const unauthReadPRRes = await getPR(
      createRequest("GET", `http://localhost/api/prs/${globexPR.id}`),
      createParams(globexPR.id)
    );
    assert(
      unauthReadPRRes.status === 401,
      "Server rejects unauthenticated GET /api/prs/[id] with 401 Unauthorized",
      `Got HTTP ${unauthReadPRRes.status}`
    );

    // 1.5 Unauthenticated Write Code-Review PR (PATCH)
    const unauthUpdatePRRes = await updatePR(
      createRequest("PATCH", `http://localhost/api/prs/${globexPR.id}`, { title: "Unauthenticated PR Tamper" }),
      createParams(globexPR.id)
    );
    assert(
      unauthUpdatePRRes.status === 401,
      "Server rejects unauthenticated PATCH /api/prs/[id] with 401 Unauthorized",
      `Got HTTP ${unauthUpdatePRRes.status}`
    );

    // 1.6 Unauthenticated Submit Decision (POST)
    const unauthDecisionRes = await submitDecision(
      createRequest("POST", `http://localhost/api/prs/${globexPR.id}/decision`, {
        decision: "approved",
        comment: "Unauthenticated approval",
      }),
      createParams(globexPR.id)
    );
    assert(
      unauthDecisionRes.status === 401,
      "Server rejects unauthenticated POST /api/prs/[id]/decision with 401 Unauthorized",
      `Got HTTP ${unauthDecisionRes.status}`
    );

    console.log("");

    // =========================================================================
    // SUITE 2: Unauthorized Cross-Tenant ID Tampering (Company A -> Company B)
    // Proving Company A user changing ID to Company B resource is rejected by the server
    // =========================================================================
    console.log("🛡️  SUITE 2: Cross-Tenant ID Tampering (User from Company A accessing Company B Resource)");
    setTestSession({ user: acmeUser }); // Authenticated as Company A (Acme Corp)

    // 2.1 Read Request: Company A user attempts to read Company B's private ticket by ID
    const bolaReadTicketRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${globexTicket.id}`),
      createParams(globexTicket.id)
    );
    const bolaReadTicketBody = await bolaReadTicketRes.json();
    assert(
      bolaReadTicketRes.status === 404,
      "Server rejects cross-tenant ticket read with 404 Not Found (BOLA: does not leak existence)",
      `Got HTTP ${bolaReadTicketRes.status}`
    );
    assert(
      bolaReadTicketBody.ticket === undefined && bolaReadTicketBody.error === "Not Found",
      "Server response contains no resource data from Company B",
      JSON.stringify(bolaReadTicketBody)
    );

    // 2.2 Write Request: Company A user attempts to update Company B's private ticket by ID
    const bolaUpdateTicketRes = await updateTicket(
      createRequest("PATCH", `http://localhost/api/tickets/${globexTicket.id}`, {
        title: "Pwned by Company A",
        description: "Maliciously modified contents",
      }),
      createParams(globexTicket.id)
    );
    const bolaUpdateTicketBody = await bolaUpdateTicketRes.json();
    assert(
      bolaUpdateTicketRes.status === 404 || bolaUpdateTicketRes.status === 403,
      "Server rejects cross-tenant ticket write with 404 Not Found / 403 Forbidden",
      `Got HTTP ${bolaUpdateTicketRes.status}`
    );
    assert(
      bolaUpdateTicketBody.ticket === undefined,
      "Server rejected update without returning modified entity",
      JSON.stringify(bolaUpdateTicketBody)
    );

    // 2.3 Write Request: Company A user attempts to delete Company B's private ticket by ID
    const bolaDeleteTicketRes = await deleteTicket(
      createRequest("DELETE", `http://localhost/api/tickets/${globexTicket.id}`),
      createParams(globexTicket.id)
    );
    assert(
      bolaDeleteTicketRes.status === 404 || bolaDeleteTicketRes.status === 403,
      "Server rejects cross-tenant ticket deletion with 404 Not Found / 403 Forbidden",
      `Got HTTP ${bolaDeleteTicketRes.status}`
    );

    // 2.4 Read Request: Company A user attempts to read Company B's code-review PR by ID
    const bolaReadPRRes = await getPR(
      createRequest("GET", `http://localhost/api/prs/${globexPR.id}`),
      createParams(globexPR.id)
    );
    const bolaReadPRBody = await bolaReadPRRes.json();
    assert(
      bolaReadPRRes.status === 404,
      "Server rejects cross-tenant PR read with 404 Not Found",
      `Got HTTP ${bolaReadPRRes.status}`
    );
    assert(
      bolaReadPRBody.pr === undefined && bolaReadPRBody.error === "Not Found",
      "Server response contains no code-review PR data from Company B",
      JSON.stringify(bolaReadPRBody)
    );

    // 2.5 Write Request: Company A user attempts to update Company B's code-review PR by ID
    const bolaUpdatePRRes = await updatePR(
      createRequest("PATCH", `http://localhost/api/prs/${globexPR.id}`, {
        title: "Malicious PR Title Injected by Company A",
      }),
      createParams(globexPR.id)
    );
    assert(
      bolaUpdatePRRes.status === 404 || bolaUpdatePRRes.status === 403,
      "Server rejects cross-tenant PR write with 404 Not Found / 403 Forbidden",
      `Got HTTP ${bolaUpdatePRRes.status}`
    );

    // 2.6 Write Request: Company A user attempts to submit review decision on Company B's PR
    const bolaDecisionRes = await submitDecision(
      createRequest("POST", `http://localhost/api/prs/${globexPR.id}/decision`, {
        decision: "approved",
        comment: "Unauthorized rogue approval by external tenant",
      }),
      createParams(globexPR.id)
    );
    assert(
      bolaDecisionRes.status === 404 || bolaDecisionRes.status === 403,
      "Server rejects cross-tenant PR approval decision with 404 Not Found / 403 Forbidden",
      `Got HTTP ${bolaDecisionRes.status}`
    );

    console.log("");

    // =========================================================================
    // SUITE 3: Database State Integrity Verification (Server Write Rejection Proof)
    // Proving that attempted writes caused zero state mutations in the database
    // =========================================================================
    console.log("🛡️  SUITE 3: Database State Integrity Verification (Zero State Mutation)");

    const freshGlobexTicket = await prisma.ticket.findUnique({ where: { id: globexTicket.id } });
    assert(
      freshGlobexTicket !== null &&
      freshGlobexTicket.title === "Globex Proprietary Financial Forecast Q4" &&
      freshGlobexTicket.description === "Confidential financial data of Globex Inc.",
      "Database State: Company B's ticket title and description remain intact and untampered"
    );
    assert(
      freshGlobexTicket?.deletedAt === null,
      "Database State: Company B's ticket was not deleted by the unauthorized request"
    );

    const freshGlobexPR = await prisma.pR.findUnique({ where: { id: globexPR.id } });
    assert(
      freshGlobexPR !== null &&
      freshGlobexPR.title === "Globex Kernel Security Module Fix" &&
      freshGlobexPR.status === PRStatus.DRAFT,
      "Database State: Company B's PR title and status remain intact in DRAFT state"
    );

    console.log("");

    // =========================================================================
    // SUITE 4: Reverse Cross-Tenant ID Tampering (Company B -> Company A)
    // =========================================================================
    console.log("🛡️  SUITE 4: Reverse Cross-Tenant Verification (User from Company B accessing Company A Resource)");
    setTestSession({ user: globexUser }); // Authenticated as Company B (Globex Inc)

    // 4.1 Company B user attempts to read Company A ticket
    const reverseReadTicketRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${acmeTicket.id}`),
      createParams(acmeTicket.id)
    );
    assert(
      reverseReadTicketRes.status === 404,
      "Server rejects Company B user reading Company A ticket with 404 Not Found",
      `Got HTTP ${reverseReadTicketRes.status}`
    );

    // 4.2 Company B user attempts to write Company A ticket
    const reverseUpdateTicketRes = await updateTicket(
      createRequest("PATCH", `http://localhost/api/tickets/${acmeTicket.id}`, { title: "Company B Tamper" }),
      createParams(acmeTicket.id)
    );
    assert(
      reverseUpdateTicketRes.status === 404 || reverseUpdateTicketRes.status === 403,
      "Server rejects Company B user writing Company A ticket with 404 / 403",
      `Got HTTP ${reverseUpdateTicketRes.status}`
    );

    // 4.3 Company B user attempts to read Company A PR
    const reverseReadPRRes = await getPR(
      createRequest("GET", `http://localhost/api/prs/${acmePR.id}`),
      createParams(acmePR.id)
    );
    assert(
      reverseReadPRRes.status === 404,
      "Server rejects Company B user reading Company A PR with 404 Not Found",
      `Got HTTP ${reverseReadPRRes.status}`
    );

    // 4.4 Company B user attempts to write Company A PR
    const reverseUpdatePRRes = await updatePR(
      createRequest("PATCH", `http://localhost/api/prs/${acmePR.id}`, { title: "Company B Tamper PR" }),
      createParams(acmePR.id)
    );
    assert(
      reverseUpdatePRRes.status === 404 || reverseUpdatePRRes.status === 403,
      "Server rejects Company B user writing Company A PR with 404 / 403",
      `Got HTTP ${reverseUpdatePRRes.status}`
    );

    console.log("");

    // =========================================================================
    // SUITE 5: Positive Controls (Proving Server Allows Legitimate Owner Requests)
    // =========================================================================
    console.log("🛡️  SUITE 5: Positive Controls (Legitimate Owner Requests Succeed with HTTP 200)");

    // 5.1 Company A accesses Company A ticket
    setTestSession({ user: acmeUser });
    const legitAcmeTicketRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${acmeTicket.id}`),
      createParams(acmeTicket.id)
    );
    assert(
      legitAcmeTicketRes.status === 200,
      "Server responds with 200 OK when Company A user accesses Company A ticket",
      `Got HTTP ${legitAcmeTicketRes.status}`
    );

    // 5.2 Company A updates Company A ticket
    const legitAcmeUpdateRes = await updateTicket(
      createRequest("PATCH", `http://localhost/api/tickets/${acmeTicket.id}`, { title: "Acme Delivery Schedule (Updated)" }),
      createParams(acmeTicket.id)
    );
    assert(
      legitAcmeUpdateRes.status === 200,
      "Server responds with 200 OK when Company A user updates Company A ticket",
      `Got HTTP ${legitAcmeUpdateRes.status}`
    );

    // 5.3 Company A accesses Company A PR
    const legitAcmePRRes = await getPR(
      createRequest("GET", `http://localhost/api/prs/${acmePR.id}`),
      createParams(acmePR.id)
    );
    assert(
      legitAcmePRRes.status === 200,
      "Server responds with 200 OK when Company A user accesses Company A PR",
      `Got HTTP ${legitAcmePRRes.status}`
    );

    // 5.4 Company B accesses Company B ticket
    setTestSession({ user: globexUser });
    const legitGlobexTicketRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${globexTicket.id}`),
      createParams(globexTicket.id)
    );
    assert(
      legitGlobexTicketRes.status === 200,
      "Server responds with 200 OK when Company B user accesses Company B ticket",
      `Got HTTP ${legitGlobexTicketRes.status}`
    );

    // 5.5 Company B accesses Company B PR
    const legitGlobexPRRes = await getPR(
      createRequest("GET", `http://localhost/api/prs/${globexPR.id}`),
      createParams(globexPR.id)
    );
    assert(
      legitGlobexPRRes.status === 200,
      "Server responds with 200 OK when Company B user accesses Company B PR",
      `Got HTTP ${legitGlobexPRRes.status}`
    );

    console.log("");

    // =========================================================================
    // SUITE 6: Cross-Org Guest / Role-Based Unauthorized Requests
    // Proving that even with a Guest role in the organization, private unshared resources
    // cannot be accessed, and write requests on shared resources are rejected with 403
    // =========================================================================
    console.log("🛡️  SUITE 6: Cross-Org Guest Role Constraints (Read-Only on Shared, Blocked on Private)");

    const guestUserSession: UserSession = {
      id: "guest-user-test-id",
      activeOrgId: globex.id,
      name: "Guest Tester",
      email: "guest@acme.com",
      memberships: [{ orgId: globex.id, orgName: "Globex Inc", role: Role.CROSS_ORG_GUEST }],
    };
    setTestSession({ user: guestUserSession });

    // 6.1 Guest in Globex tries to read unshared Acme ticket
    const guestReadUnsharedRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${acmeTicket.id}`),
      createParams(acmeTicket.id)
    );
    assert(
      guestReadUnsharedRes.status === 404,
      "Server rejects Guest user reading unshared private Acme ticket with 404 Not Found",
      `Got HTTP ${guestReadUnsharedRes.status}`
    );

    // 6.2 Share Acme ticket with Globex, then verify read is allowed but write is 403 Forbidden
    await prisma.ticketShare.create({
      data: {
        ticketId: acmeTicket.id,
        sharedWithOrgId: globex.id,
      },
    });

    const guestReadSharedRes = await getTicket(
      createRequest("GET", `http://localhost/api/tickets/${acmeTicket.id}`),
      createParams(acmeTicket.id)
    );
    assert(
      guestReadSharedRes.status === 200,
      "Server allows Guest user reading shared ticket with 200 OK",
      `Got HTTP ${guestReadSharedRes.status}`
    );

    const guestWriteSharedRes = await updateTicket(
      createRequest("PATCH", `http://localhost/api/tickets/${acmeTicket.id}`, { title: "Guest Write Attempt" }),
      createParams(acmeTicket.id)
    );
    assert(
      guestWriteSharedRes.status === 403,
      "Server rejects Guest user writing to shared ticket with 403 Forbidden",
      `Got HTTP ${guestWriteSharedRes.status}`
    );

    // Clean up temporary share
    await prisma.ticketShare.deleteMany({
      where: { ticketId: acmeTicket.id, sharedWithOrgId: globex.id },
    });

  } finally {
    // Reset test session
    setTestSession(undefined);

    // Clean up test fixtures
    console.log("\n🧹 Cleaning up test fixtures from database...");
    await prisma.ticket.deleteMany({
      where: { id: { in: [globexTicket.id, acmeTicket.id] } },
    });
    await prisma.pR.deleteMany({
      where: { id: { in: [globexPR.id, acmePR.id] } },
    });
    console.log("  ℹ️ Cleanup complete.");
  }

  console.log("\n=======================================================");
  console.log(`📊 Tenant Isolation Suite Summary: ${passed} Passed, ${failed} Failed.`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTenantIsolationTests()
  .catch((err) => {
    console.error("❌ Fatal error in tenant isolation test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
