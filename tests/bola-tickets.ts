import "dotenv/config";
import { prisma } from "../lib/prisma";
import { canPerform } from "../lib/authz";

async function verifyReadAccess(email: string, activeOrgId: string, ticketId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found: ${email}`);

  const sessionUser = {
    id: user.id,
    activeOrgId,
    memberships: user.memberships.map((m: any) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { shares: true },
  });

  if (!ticket || ticket.deletedAt !== null) {
    return "NOT_FOUND";
  }

  const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

  const allowed = canPerform(sessionUser, "read_ticket", {
    ticketOwnerOrgId: ticket.orgId,
    isTicketSharedWithActiveOrg: isShared,
  });



  if (!allowed) {
    return "NOT_FOUND";
  }

  return "ALLOWED";
}

async function verifyEditAccess(email: string, activeOrgId: string, ticketId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });

  if (!user) throw new Error(`User not found: ${email}`);

  const sessionUser = {
    id: user.id,
    activeOrgId,
    memberships: user.memberships.map((m: any) => ({
      orgId: m.orgId,
      orgName: m.org.name,
      role: m.role,
    })),
  };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { shares: true },
  });

  if (!ticket || ticket.deletedAt !== null) {
    return "NOT_FOUND";
  }

  const isShared = ticket.shares.some((s) => s.sharedWithOrgId === activeOrgId);

  const allowed = canPerform(sessionUser, "edit_ticket", {
    ticketOwnerOrgId: ticket.orgId,
    isTicketSharedWithActiveOrg: isShared,
  });

  if (!allowed) {
    return "FORBIDDEN";
  }

  return "ALLOWED";
}

async function runTests() {
  console.log("🚀 Starting BOLA Security Tests for Tickets...\n");

  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme or Globex orgs)");
    process.exit(1);
  }

  // Find Acme Ticket
  const acmeTicket = await prisma.ticket.findFirst({
    where: { orgId: acme.id, deletedAt: null },
  });

  // Find Globex Ticket (Not shared)
  // Let's create a temporary Globex ticket just to be sure we have one for testing
  const globexAdmin = await prisma.user.findFirst({ where: { email: "admin@globex.com" } });
  if (!globexAdmin) {
    console.error("❌ Seed database first (could not find admin@globex.com)");
    process.exit(1);
  }

  const globexTicket = await prisma.ticket.create({
    data: {
      orgId: globex.id,
      title: "Globex Private Config Leak",
      description: "Super secret internals of Globex.",
      createdById: globexAdmin.id,
      status: "OPEN",
    },
  });

  if (!acmeTicket || !globexTicket) {
    console.error("❌ Setup error: could not fetch test tickets.");
    process.exit(1);
  }

  let failed = false;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`✅ ${message}`);
    } else {
      console.error(`❌ FAILED: ${message}`);
      failed = true;
    }
  };

  // --- Test Case 1: Acme user attempts to read a private Globex ticket ---
  const t1 = await verifyReadAccess("admin@acme.com", acme.id, globexTicket.id);
  assert(t1 === "NOT_FOUND", "Acme Admin reading private Globex ticket must return NOT_FOUND (BOLA)");

  // --- Test Case 2: Acme user attempts to edit a private Globex ticket ---
  const t2 = await verifyEditAccess("admin@acme.com", acme.id, globexTicket.id);
  assert(t2 === "FORBIDDEN", "Acme Admin editing private Globex ticket must return FORBIDDEN (BOLA)");

  // --- Test Case 3: Acme user as a guest in Globex tries to read a Globex ticket that IS shared with Acme ---
  // Let's share acmeTicket with Globex
  await prisma.ticketShare.upsert({
    where: { ticketId_sharedWithOrgId: { ticketId: acmeTicket.id, sharedWithOrgId: globex.id } },
    create: { ticketId: acmeTicket.id, sharedWithOrgId: globex.id },
    update: {},
  });

  const t3 = await verifyReadAccess("admin@acme.com", globex.id, acmeTicket.id);
  assert(t3 === "ALLOWED", "Acme User (active role Guest in Globex) reading shared Acme ticket must be ALLOWED");

  // --- Test Case 4: Acme user as a guest in Globex tries to edit the shared Acme ticket ---
  const t4 = await verifyEditAccess("admin@acme.com", globex.id, acmeTicket.id);
  assert(t4 === "FORBIDDEN", "Acme User (active role Guest in Globex) editing shared Acme ticket must return FORBIDDEN");

  // --- Test Case 5: Acme user as a guest in Globex tries to read a non-shared Acme ticket ---
  // Create another private Acme ticket
  const acmePrivateTicket = await prisma.ticket.create({
    data: {
      orgId: acme.id,
      title: "Acme Private Internal Discussion",
      description: "Do not share this outside Acme.",
      createdById: globexAdmin.id, // created by admin
      status: "OPEN",
    },
  });

  const t5 = await verifyReadAccess("admin@acme.com", globex.id, acmePrivateTicket.id);
  assert(t5 === "NOT_FOUND", "Acme User (active role Guest in Globex) reading private non-shared Acme ticket must return NOT_FOUND (BOLA)");

  // Cleanup temporary tickets and shares
  await prisma.ticket.delete({ where: { id: globexTicket.id } });
  await prisma.ticket.delete({ where: { id: acmePrivateTicket.id } });
  await prisma.ticketShare.deleteMany({ where: { ticketId: acmeTicket.id, sharedWithOrgId: globex.id } });

  console.log("\n---");
  if (failed) {
    console.error("❌ BOLA Security Test Suite Failed!");
    process.exit(1);
  } else {
    console.log("🎉 All BOLA Security Tests Passed Successfully!");
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
