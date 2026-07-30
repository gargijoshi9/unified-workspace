import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { TicketsService } from "../src/backend/modules/ticket/ticketsService";
import { PRsService } from "../src/backend/modules/pr/prsService";
import { AuditRepository } from "../src/backend/modules/audit/auditRepository";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import { Role, TicketStatus } from "@prisma/client";

async function getSessionUser(email: string): Promise<UserSession> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found: ${email}`);

  return {
    id: user.id,
    activeOrgId: user.memberships[0].orgId,
    name: user.name,
    email: user.email,
    memberships: user.memberships.map((m: any) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };
}

async function runAuditTests() {
  console.log("🚀 Starting Append-Only Audit Logging Automated Test Suite...\n");

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

  // Load Admin and Reviewer session users
  const adminUser = await getSessionUser("admin@acme.com");
  const reviewerUser = await getSessionUser("reviewer@acme.com");
  const globexOrg = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!globexOrg) throw new Error("Globex org missing from database");

  // --- SCENARIO 1: Ticket Created → Audit Record ---
  console.log("📌 Scenario 1: Audit Log Generation on Ticket Creation");
  const createTicketRes = await TicketsService.createTicket(adminUser, {
    title: "Audit Test Ticket #1",
    description: "Testing audit logging trigger for ticket creation",
    status: TicketStatus.OPEN,
  });

  const ticketCreatedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "ticket.created",
      entityId: createTicketRes.id,
    },
  });

  assert(ticketCreatedAudit !== null, "Audit entry generated for ticket.created");
  assert(
    ticketCreatedAudit?.actorId === adminUser.id && ticketCreatedAudit?.orgId === adminUser.activeOrgId,
    "Audit record accurately stores actorId and orgId"
  );

  console.log("");

  // --- SCENARIO 2: Ticket Updated → Audit Record ---
  console.log("📌 Scenario 2: Audit Log Generation on Ticket Update");
  await TicketsService.updateTicket(createTicketRes.id, adminUser, {
    title: "Audit Test Ticket #1 (Updated)",
    status: TicketStatus.IN_PROGRESS,
  });

  const ticketUpdatedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "ticket.updated",
      entityId: createTicketRes.id,
    },
  });

  assert(ticketUpdatedAudit !== null, "Audit entry generated for ticket.updated");

  console.log("");

  // --- SCENARIO 3: PR Created → Audit Record ---
  console.log("📌 Scenario 3: Audit Log Generation on PR Creation");
  const createPrRes = await PRsService.createPR(adminUser, {
    title: "Audit Test PR #1",
    description: "Testing audit logging trigger for PR creation",
  });

  const prCreatedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "pr.created",
      entityId: createPrRes.id,
    },
  });

  assert(prCreatedAudit !== null, "Audit entry generated for pr.created");

  console.log("");

  // --- SCENARIO 4: PR Approved → Audit Record ---
  console.log("📌 Scenario 4: Audit Log Generation on PR Review Approval");
  // Assign reviewer to PR first
  await PRsService.assignReviewers(createPrRes.id, adminUser, [reviewerUser.id]);

  // Reviewer approves PR
  await PRsService.submitDecision(createPrRes.id, reviewerUser, "approved", "LGTM!");

  const prApprovedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "pr.approved",
      entityId: createPrRes.id,
    },
  });

  assert(prApprovedAudit !== null, "Audit entry generated for pr.approved");

  console.log("");

  // --- SCENARIO 5: Resource Shared → Audit Record ---
  console.log("📌 Scenario 5: Audit Log Generation on Resource Sharing");
  await TicketsService.shareTicket(createTicketRes.id, adminUser, globexOrg.id);

  const ticketSharedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "ticket.shared",
      entityId: createTicketRes.id,
    },
  });

  assert(ticketSharedAudit !== null, "Audit entry generated for ticket.shared");

  console.log("");

  // --- SCENARIO 6: Verify Audit Entries Cannot Be Updated ---
  console.log("📌 Scenario 6: Append-Only Immutable Guard - Preventing Updates");
  let updateErrorCaught = false;

  try {
    await AuditRepository.update();
  } catch (err: any) {
    updateErrorCaught = true;
    assert(
      err.message === "Audit logs are append-only and cannot be updated.",
      "Attempting to update audit log throws explicit append-only restriction error"
    );
  }
  assert(updateErrorCaught, "Audit log update attempt rejected");

  console.log("");

  // --- SCENARIO 7: Verify Audit Entries Cannot Be Deleted ---
  console.log("📌 Scenario 7: Append-Only Immutable Guard - Preventing Deletions");
  let deleteErrorCaught = false;

  try {
    await AuditRepository.delete();
  } catch (err: any) {
    deleteErrorCaught = true;
    assert(
      err.message === "Audit logs are append-only and cannot be deleted.",
      "Attempting to delete audit log throws explicit append-only restriction error"
    );
  }
  assert(deleteErrorCaught, "Audit log deletion attempt rejected");

  console.log("\n==========================================");
  console.log(`📊 Audit Test Results: ${passed} Passed, ${failed} Failed.`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests()
  .catch((err) => {
    console.error("❌ Fatal error in audit test suite:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
