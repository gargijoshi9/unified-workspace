import { prisma } from "./prisma";

/**
 * Generates an AI-templated digest for a specific user within an organization
 * and saves it to the database.
 */
export async function generateDigestForUser(userId: string, orgId: string): Promise<string> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // 1. Fetch own organization's active tickets (Open or In Progress)
  const activeTickets = await prisma.ticket.findMany({
    where: {
      orgId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      deletedAt: null,
    },
  });

  const activeTicketsCount = activeTickets.length;
  const overdueTicketsCount = activeTickets.filter((t) => t.createdAt < threeDaysAgo).length;

  // 2. Fetch pending PR reviews for the user
  // (where they are assigned as a reviewer, decision is null, and status is IN_REVIEW or APPROVED)
  const pendingPRs = await prisma.pR.findMany({
    where: {
      status: { in: ["IN_REVIEW", "APPROVED"] },
      reviewers: {
        some: {
          userId,
          decision: null,
        },
      },
      // Access check boundary: PR belongs to user's org OR is explicitly shared with it
      OR: [
        { orgId },
        { shares: { some: { sharedWithOrgId: orgId } } },
      ],
    },
    orderBy: { updatedAt: "asc" }, // Oldest updated first
  });

  const pendingPRsCount = pendingPRs.length;
  let oldestPRIdleDays = 0;
  if (pendingPRs.length > 0) {
    const oldestPR = pendingPRs[0];
    const timeDiff = new Date().getTime() - oldestPR.updatedAt.getTime();
    oldestPRIdleDays = Math.max(0, Math.floor(timeDiff / (1000 * 3600 * 24)));
  }

  // 3. Fetch shared tickets/PRs needing attention
  const sharedTicketsCount = await prisma.ticketShare.count({
    where: {
      sharedWithOrgId: orgId,
      ticket: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        deletedAt: null,
      },
    },
  });

  const sharedPRsCount = await prisma.pRShare.count({
    where: {
      sharedWithOrgId: orgId,
      pr: {
        status: { in: ["IN_REVIEW", "APPROVED"] },
      },
    },
  });

  const sharedItemsCount = sharedTicketsCount + sharedPRsCount;

  // Get organization name for personalization
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  const orgName = org?.name || "your organization";

  // Build template sentence
  let digestContent = `You have ${activeTicketsCount} active tickets in ${orgName} (${overdueTicketsCount} overdue). `;
  digestContent += `${pendingPRsCount} PRs are waiting on your review`;
  if (pendingPRsCount > 0) {
    digestContent += `; oldest is ${oldestPRIdleDays} days idle`;
  }
  digestContent += `.`;

  if (sharedItemsCount > 0) {
    digestContent += ` ${sharedItemsCount} shared item${sharedItemsCount === 1 ? "" : "s"} need${sharedItemsCount === 1 ? "s" : ""} attention.`;
  }

  // Create digest record
  await prisma.digest.create({
    data: {
      userId,
      orgId,
      content: digestContent,
      read: false,
    },
  });

  return digestContent;
}
