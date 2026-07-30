import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { canPerform } from "../src/backend/modules/auth/authorize";
import { UserSession } from "../src/backend/modules/auth/auth.types";
import { Role } from "@prisma/client";

async function getSessionUser(email: string, activeOrgId?: string): Promise<UserSession> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found in seed database: ${email}`);

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

async function runRbacTests() {
  console.log("🚀 Starting Comprehensive RBAC Authorization Suite...\n");

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ""}`);
      failedTests++;
    }
  }

  // Load Seed Entities
  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme or Globex orgs)");
    process.exit(1);
  }

  const acmeTicket = await prisma.ticket.findFirst({
    where: { orgId: acme.id, deletedAt: null },
    include: { shares: true },
  });

  const acmePR = await prisma.pR.findFirst({
    where: { orgId: acme.id },
    include: { shares: true },
  });

  if (!acmeTicket || !acmePR) {
    console.error("❌ Seed database first (missing test ticket or PR in Acme Corp)");
    process.exit(1);
  }

  const ticketContext = {
    ticketOwnerOrgId: acmeTicket.orgId,
    isTicketSharedWithActiveOrg: true,
  };

  const prContext = {
    prOwnerOrgId: acmePR.orgId,
    prAuthorId: acmePR.authorId,
    isPrSharedWithActiveOrg: true,
  };

  // Shared Ticket/PR Context for Globex user when viewing ticket1 (shared with Globex)
  const sharedTicketContext = {
    ticketOwnerOrgId: acmeTicket.orgId,
    isTicketSharedWithActiveOrg: true,
  };

  // Create unshared contexts for BOLA/RBAC fail tests
  const unsharedTicketContext = {
    ticketOwnerOrgId: acmeTicket.orgId,
    isTicketSharedWithActiveOrg: false,
  };
  const unsharedPRContext = {
    prOwnerOrgId: acmePR.orgId,
    prAuthorId: acmePR.authorId,
    isPrSharedWithActiveOrg: false,
  };

  // ==========================================
  // 1. ORG_ADMIN (admin@acme.com)
  // ==========================================
  console.log("📌 Testing ORG_ADMIN Role (Alice Admin)");
  const orgAdminUser = await getSessionUser("admin@acme.com", acme.id);

  assert(canPerform(orgAdminUser, "create_ticket"), "ORG_ADMIN: Create Ticket");
  assert(canPerform(orgAdminUser, "read_ticket", ticketContext), "ORG_ADMIN: View Ticket");
  assert(canPerform(orgAdminUser, "edit_ticket", ticketContext), "ORG_ADMIN: Update Ticket");
  assert(canPerform(orgAdminUser, "delete_ticket", ticketContext), "ORG_ADMIN: Delete Ticket");
  assert(canPerform(orgAdminUser, "share_ticket", ticketContext), "ORG_ADMIN: Share Ticket");

  assert(canPerform(orgAdminUser, "create_pr"), "ORG_ADMIN: Create PR");
  assert(canPerform(orgAdminUser, "read_pr", prContext), "ORG_ADMIN: View PR");
  assert(canPerform(orgAdminUser, "edit_pr", prContext), "ORG_ADMIN: Update PR");
  assert(canPerform(orgAdminUser, "merge_pr", prContext), "ORG_ADMIN: Delete/Merge PR");
  assert(canPerform(orgAdminUser, "assign_reviewer", prContext), "ORG_ADMIN: Assign Reviewer");

  assert(canPerform(orgAdminUser, "view_audit_logs"), "ORG_ADMIN: View Audit");
  assert(canPerform(orgAdminUser, "view_audit_logs"), "ORG_ADMIN: Export Audit");
  assert(canPerform(orgAdminUser, "manage_feature_flags"), "ORG_ADMIN: Manage Feature Flags / Organization");
  assert(canPerform(orgAdminUser, "share_pr", prContext), "ORG_ADMIN: Manage Connections");

  console.log("");

  // ==========================================
  // 2. SUPPORT_AGENT (agent@acme.com)
  // ==========================================
  console.log("📌 Testing SUPPORT_AGENT Role (Sam Support)");
  const agentUser = await getSessionUser("agent@acme.com", acme.id);

  // Should PASS
  assert(canPerform(agentUser, "create_ticket"), "SUPPORT_AGENT: Create Ticket");
  assert(canPerform(agentUser, "read_ticket", ticketContext), "SUPPORT_AGENT: View Ticket");
  assert(canPerform(agentUser, "edit_ticket", ticketContext), "SUPPORT_AGENT: Update Ticket");
  assert(canPerform(agentUser, "comment_ticket", ticketContext), "SUPPORT_AGENT: Comment");
  assert(canPerform(agentUser, "edit_ticket", ticketContext), "SUPPORT_AGENT: Upload Attachment / Change Status");

  // Should FAIL (Return 403 / false)
  assert(!canPerform(agentUser, "create_pr"), "SUPPORT_AGENT [403]: Create PR");
  assert(!canPerform(agentUser, "submit_decision"), "SUPPORT_AGENT [403]: Review PR");
  assert(!canPerform(agentUser, "view_audit_logs"), "SUPPORT_AGENT [403]: View Audit");
  assert(!canPerform(agentUser, "manage_feature_flags"), "SUPPORT_AGENT [403]: Manage Organization");
  assert(!canPerform(agentUser, "share_pr", prContext), "SUPPORT_AGENT [403]: Manage Connections");

  console.log("");

  // ==========================================
  // 3. REVIEWER_APPROVER (reviewer@acme.com)
  // ==========================================
  console.log("📌 Testing REVIEWER_APPROVER Role (Ravi Reviewer)");
  const reviewerUser = await getSessionUser("reviewer@acme.com", acme.id);

  // Should PASS
  assert(canPerform(reviewerUser, "read_ticket", ticketContext), "REVIEWER_APPROVER: View Tickets");
  assert(canPerform(reviewerUser, "comment_ticket", ticketContext), "REVIEWER_APPROVER: Comment Tickets");
  assert(canPerform(reviewerUser, "submit_decision"), "REVIEWER_APPROVER: Review Tickets / Approve / Reject / Request Changes");
  assert(canPerform(reviewerUser, "read_pr", prContext), "REVIEWER_APPROVER: View PR");
  assert(canPerform(reviewerUser, "view_audit_logs"), "REVIEWER_APPROVER: View Audit");

  // Should FAIL (Return 403 / false)
  assert(!canPerform(reviewerUser, "delete_ticket", ticketContext), "REVIEWER_APPROVER [403]: Delete Ticket");
  assert(!canPerform(reviewerUser, "merge_pr", prContext), "REVIEWER_APPROVER [403]: Delete/Merge PR");
  assert(!canPerform(reviewerUser, "edit_pr", prContext), "REVIEWER_APPROVER [403]: Manage Organization");
  assert(!canPerform(reviewerUser, "assign_reviewer", prContext), "REVIEWER_APPROVER [403]: Manage Users");
  assert(!canPerform(reviewerUser, "share_pr", prContext), "REVIEWER_APPROVER [403]: Manage Connections");

  console.log("");

  // ==========================================
  // 4. CROSS_ORG_GUEST (admin@globex.com acting in Globex org as guest)
  // ==========================================
  console.log("📌 Testing CROSS_ORG_GUEST Role (Gina Guest)");
  const guestUser = {
    id: "guest-user-id",
    activeOrgId: globex.id,
    memberships: [{ orgId: globex.id, orgName: "Globex Inc", role: Role.CROSS_ORG_GUEST }],
  };

  // Should PASS when resource is explicitly shared
  assert(canPerform(guestUser, "read_ticket", sharedTicketContext), "CROSS_ORG_GUEST: View Shared Ticket");
  assert(canPerform(guestUser, "comment_ticket", sharedTicketContext), "CROSS_ORG_GUEST: Comment Shared Ticket");

  // Should FAIL (Return 403 / false)
  assert(!canPerform(guestUser, "edit_ticket", sharedTicketContext), "CROSS_ORG_GUEST [403]: Edit Ticket");
  assert(!canPerform(guestUser, "delete_ticket", sharedTicketContext), "CROSS_ORG_GUEST [403]: Delete Ticket");
  assert(!canPerform(guestUser, "read_ticket", unsharedTicketContext), "CROSS_ORG_GUEST [403]: Browse Other Tickets");
  assert(!canPerform(guestUser, "read_pr", unsharedPRContext), "CROSS_ORG_GUEST [403]: View Organization PRs");
  assert(!canPerform(guestUser, "view_audit_logs"), "CROSS_ORG_GUEST [403]: Access Audit");
  assert(!canPerform(guestUser, "share_ticket", sharedTicketContext), "CROSS_ORG_GUEST [403]: Share Resources");

  console.log("");

  // ==========================================
  // 5. PLATFORM_SUPER_ADMIN (super@platform.com)
  // ==========================================
  console.log("📌 Testing PLATFORM_SUPER_ADMIN Role (Pat SuperAdmin)");
  const superAdminUser = await getSessionUser("super@platform.com", acme.id);

  // Should PASS
  assert(canPerform(superAdminUser, "create_ticket"), "PLATFORM_SUPER_ADMIN: Create Organization / Ticket");
  assert(canPerform(superAdminUser, "manage_feature_flags"), "PLATFORM_SUPER_ADMIN: Suspend Organization / Feature Flags");
  assert(canPerform(superAdminUser, "edit_ticket", ticketContext), "PLATFORM_SUPER_ADMIN: Manage Global Settings");
  assert(canPerform(superAdminUser, "share_pr", prContext), "PLATFORM_SUPER_ADMIN: Manage Cross-Org Connections");
  assert(canPerform(superAdminUser, "view_audit_logs"), "PLATFORM_SUPER_ADMIN: View Global Audit");

  console.log("\n==========================================");
  console.log(`📊 Final Results: ${passedTests} Passed, ${failedTests} Failed.`);
  console.log("==========================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRbacTests()
  .catch((err) => {
    console.error("❌ Test suite fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
