import "dotenv/config";
import { prisma } from "../src/backend/shared/prisma";
import { generateDigestForUser } from "../src/backend/modules/ai/digest";
import { Role, TicketStatus, PRStatus } from "@prisma/client";

async function runTests() {
  console.log("🚀 Starting AI-Leak and security tests for Digests (Dynamic)...\n");

  const acme = await prisma.org.findFirst({ where: { name: "Acme Corp" } });
  const globex = await prisma.org.findFirst({ where: { name: "Globex Inc" } });

  if (!acme || !globex) {
    console.error("❌ Seed database first (could not find Acme or Globex orgs)");
    process.exit(1);
  }

  // Find or create test users
  const acmeUser = await prisma.user.findFirst({ where: { email: "admin@acme.com" } });
  const globexUser = await prisma.user.findFirst({ where: { email: "admin@globex.com" } });

  if (!acmeUser || !globexUser) {
    console.error("❌ Seed database first (could not find required test users)");
    process.exit(1);
  }

  // Count existing items to support dynamic checks
  const initialAcmeTicketsCount = await prisma.ticket.count({
    where: {
      orgId: acme.id,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      deletedAt: null,
    },
  });

  const initialSharedTickets = await prisma.ticketShare.count({
    where: {
      sharedWithOrgId: acme.id,
      ticket: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        deletedAt: null,
      },
    },
  });
  const initialSharedPRs = await prisma.pRShare.count({
    where: {
      sharedWithOrgId: acme.id,
      pr: {
        status: { in: ["IN_REVIEW", "APPROVED"] },
      },
    },
  });
  const initialSharedCount = initialSharedTickets + initialSharedPRs;

  // Cleanup any old digests for these users to prevent interference
  await prisma.digest.deleteMany({
    where: { userId: { in: [acmeUser.id, globexUser.id] } },
  });

  // Create temporary private Globex tickets
  const globexTicket = await prisma.ticket.create({
    data: {
      orgId: globex.id,
      title: "Globex Private Financial Audit Log",
      description: "Extremely sensitive data.",
      createdById: globexUser.id,
      status: TicketStatus.OPEN,
    },
  });

  // Create temporary private Acme tickets (adding 1 more active ticket)
  const acmeTicket = await prisma.ticket.create({
    data: {
      orgId: acme.id,
      title: "Acme Customer Delivery Plan",
      description: "Deliver supplies on Friday.",
      createdById: acmeUser.id,
      status: TicketStatus.OPEN,
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

  try {
    // Expected active tickets count is: initial count + 1 (the temporary one we created)
    const expectedActiveCount = initialAcmeTicketsCount + 1;

    // --- Step 1: Generate initial digest for Acme User ---
    const digest1 = await generateDigestForUser(acmeUser.id, acme.id);
    
    assert(
      digest1.includes(`${expectedActiveCount} active tickets`),
      `Acme digest should count ${expectedActiveCount} active tickets (got: "${digest1}")`
    );
    if (initialSharedCount === 0) {
      assert(
        !digest1.toLowerCase().includes("shared item"),
        "Acme digest should not mention any shared items initially"
      );
    } else {
      assert(
        digest1.includes(`${initialSharedCount} shared item`),
        `Acme digest should report ${initialSharedCount} shared items initially (got: "${digest1}")`
      );
    }
    assert(
      !digest1.includes(`${expectedActiveCount + 1} active tickets`),
      "Acme digest must NOT leak/count private Globex tickets (BOLA isolation)"
    );

    // --- Step 2: Share Globex ticket with Acme and regenerate digest ---
    const ticketShare = await prisma.ticketShare.create({
      data: {
        ticketId: globexTicket.id,
        sharedWithOrgId: acme.id,
      },
    });

    const digest2 = await generateDigestForUser(acmeUser.id, acme.id);

    const expectedSharedCount = initialSharedCount + 1;

    assert(
      digest2.includes(`${expectedSharedCount} shared item`),
      `Acme digest should report ${expectedSharedCount} shared items after sharing (got: "${digest2}")`
    );
    assert(
      digest2.includes(`${expectedActiveCount} active tickets`),
      `Acme active ticket count should remain ${expectedActiveCount} (since the shared ticket is not owned by Acme)`
    );

    // Clean up share and regenerate to check revocation
    await prisma.ticketShare.delete({ where: { id: ticketShare.id } });

    const digest3 = await generateDigestForUser(acmeUser.id, acme.id);
    if (initialSharedCount === 0) {
      assert(
        !digest3.toLowerCase().includes("shared item"),
        "Acme digest should revert to 0 shared items after share is revoked"
      );
    } else {
      assert(
        digest3.includes(`${initialSharedCount} shared item`),
        `Acme digest should revert to initial ${initialSharedCount} shared items (got: "${digest3}")`
      );
    }

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    failed = true;
  } finally {
    // Cleanup temporary records
    await prisma.digest.deleteMany({
      where: { userId: { in: [acmeUser.id, globexUser.id] } },
    });
    await prisma.ticket.delete({ where: { id: globexTicket.id } });
    await prisma.ticket.delete({ where: { id: acmeTicket.id } });
  }

  console.log("\n---");
  if (failed) {
    console.error("❌ Digest Security and AI-Leak Tests Failed!");
    process.exit(1);
  } else {
    console.log("🎉 All Digest Security and AI-Leak Tests Passed Successfully!");
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
