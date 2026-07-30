import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { canPerform } from "../src/backend/modules/auth/authz";
import { Role, PRStatus } from "@prisma/client";

async function getSessionUser(email: string, activeOrgId: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found: ${email}`);

  return {
    id: user.id,
    activeOrgId,
    memberships: user.memberships.map((m: any) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };
}

async function verifyPRReadAccess(email: string, activeOrgId: string, prId: string): Promise<string> {
  const sessionUser = await getSessionUser(email, activeOrgId);

  const pr = await prisma.pR.findUnique({
    where: { id: prId },
    include: { shares: true },
  });

  if (!pr) return "NOT_FOUND";

  const isShared = pr.shares.some((s: any) => s.sharedWithOrgId === activeOrgId);

  const allowed = canPerform(sessionUser, "read_pr", {
    prOwnerOrgId: pr.orgId,
    isPrSharedWithActiveOrg: isShared,
  });

  if (!allowed) return "NOT_FOUND";

  return "ALLOWED";
}

async function verifyPREditAccess(email: string, activeOrgId: string, prId: string): Promise<string> {
  const sessionUser = await getSessionUser(email, activeOrgId);

  const pr = await prisma.pR.findUnique({
    where: { id: prId },
    include: { shares: true },
  });

  if (!pr) return "NOT_FOUND";

  const isShared = pr.shares.some((s: any) => s.sharedWithOrgId === activeOrgId);

  // Read check first
  const canRead = canPerform(sessionUser, "read_pr", {
    prOwnerOrgId: pr.orgId,
    isPrSharedWithActiveOrg: isShared,
  });
  if (!canRead) return "NOT_FOUND";

  const allowed = canPerform(sessionUser, "edit_pr", {
    prOwnerOrgId: pr.orgId,
    prAuthorId: pr.authorId,
    isPrSharedWithActiveOrg: isShared,
  });

  if (!allowed) return "FORBIDDEN";

  return "ALLOWED";
}

async function verifyPRApproveAccess(email: string, activeOrgId: string, prId: string): Promise<string> {
  const sessionUser = await getSessionUser(email, activeOrgId);

  const pr = await prisma.pR.findUnique({
    where: { id: prId },
    include: { reviewers: true, shares: true },
  });

  if (!pr) return "NOT_FOUND";

  const isShared = pr.shares.some((s: any) => s.sharedWithOrgId === activeOrgId);

  // Read check first
  const canRead = canPerform(sessionUser, "read_pr", {
    prOwnerOrgId: pr.orgId,
    isPrSharedWithActiveOrg: isShared,
  });
  if (!canRead) return "NOT_FOUND";

  // Check general permission to submit decision
  const hasApprovePermission = canPerform(sessionUser, "submit_decision");
  if (!hasApprovePermission) return "FORBIDDEN";

  // BOLA Check: Verify user is an assigned reviewer for this specific PR
  const isAssigned = pr.reviewers.some((r) => r.userId === sessionUser.id);
  if (!isAssigned) return "FORBIDDEN";

  return "ALLOWED";
}

async function runTests() {
  console.log("🚀 Starting BOLA Security Tests for PRs...\n");

  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme or Globex orgs)");
    process.exit(1);
  }

  // Fetch admin and reviewer accounts
  const acmeAdmin = await prisma.user.findFirst({ where: { email: "admin@acme.com" } });
  const globexAdmin = await prisma.user.findFirst({ where: { email: "admin@globex.com" } });
  const acmeReviewer = await prisma.user.findFirst({ where: { email: "reviewer@acme.com" } });

  if (!acmeAdmin || !globexAdmin || !acmeReviewer) {
    console.error("❌ Seed database first (could not find required test users)");
    process.exit(1);
  }

  // Create temporary test Globex PR
  const globexPR = await prisma.pR.create({
    data: {
      orgId: globex.id,
      title: "Globex Core Microservice API Keys",
      description: "Do not disclose. Admin credentials inside.",
      authorId: globexAdmin.id,
      status: PRStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  // Create temporary test Acme PR
  const acmePR = await prisma.pR.create({
    data: {
      orgId: acme.id,
      title: "Acme Internal Payroll Restructuring",
      description: "Confidential salaries document.",
      authorId: acmeAdmin.id,
      status: PRStatus.IN_REVIEW,
      requiredApprovals: 1,
    },
  });

  // Assign Reviewer to Acme PR
  const reviewerRow = await prisma.pRReviewer.create({
    data: {
      prId: acmePR.id,
      userId: acmeReviewer.id,
    },
  });

  let failed = false;
  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`✅ ${message}`);
    } else {
      console.error(`❌ FAILED: ${message}`);
      failed = true;
    }
  };

  // --- Test Case 1: Acme Admin tries to read private Globex PR ---
  const t1 = await verifyPRReadAccess("admin@acme.com", acme.id, globexPR.id);
  assert(t1 === "NOT_FOUND", "Acme Admin reading private Globex PR must return NOT_FOUND (BOLA)");

  // --- Test Case 2: Acme Admin tries to edit private Globex PR ---
  const t2 = await verifyPREditAccess("admin@acme.com", acme.id, globexPR.id);
  assert(t2 === "NOT_FOUND", "Acme Admin editing private Globex PR must return NOT_FOUND (BOLA)");

  // --- Test Case 3: Acme Admin (not assigned) tries to approve Acme PR ---
  const t3 = await verifyPRApproveAccess("admin@acme.com", acme.id, acmePR.id);
  assert(t3 === "FORBIDDEN", "Unassigned Acme Admin attempting to approve Acme PR must return FORBIDDEN");

  // --- Test Case 4: Acme Reviewer (assigned) tries to approve Acme PR ---
  const t4 = await verifyPRApproveAccess("reviewer@acme.com", acme.id, acmePR.id);
  assert(t4 === "ALLOWED", "Assigned Acme Reviewer approving Acme PR must be ALLOWED");

  // --- Test Case 5: Guest User from Globex (active Guest role in Acme) tries to approve a shared Acme PR ---
  // Create shared link for Globex
  await prisma.pRShare.create({
    data: {
      prId: acmePR.id,
      sharedWithOrgId: globex.id,
    },
  });

  // Create Guest user membership in Acme to represent Guest
  const globexGuest = await prisma.user.create({
    data: {
      email: "guest-test@globex.com",
      name: "Globex Guest in Acme",
      passwordHash: "dummy",
    },
  });
  await prisma.membership.create({
    data: {
      userId: globexGuest.id,
      orgId: acme.id,
      role: Role.CROSS_ORG_GUEST,
    },
  });

  // Guest tries to approve shared PR
  const t5 = await verifyPRApproveAccess("guest-test@globex.com", acme.id, acmePR.id);
  assert(t5 === "FORBIDDEN", "Cross-Org Guest attempting to approve shared PR must return FORBIDDEN");

  // Cleanup temporary data
  await prisma.pRReviewer.delete({ where: { id: reviewerRow.id } });
  await prisma.pRShare.deleteMany({ where: { prId: acmePR.id } });
  await prisma.membership.deleteMany({ where: { userId: globexGuest.id } });
  await prisma.user.delete({ where: { id: globexGuest.id } });
  await prisma.pR.delete({ where: { id: globexPR.id } });
  await prisma.pR.delete({ where: { id: acmePR.id } });

  console.log("\n---");
  if (failed) {
    console.error("❌ BOLA Security Test Suite for PRs Failed!");
    process.exit(1);
  } else {
    console.log("🎉 All BOLA Security Tests for PRs Passed Successfully!");
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
