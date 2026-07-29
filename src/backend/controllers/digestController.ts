import { auth } from "@/backend/auth";
import { prisma } from "@/backend/lib/prisma";
import { generateDigestForUser } from "@/backend/lib/digest";
import { NextResponse } from "next/server";

// GET /api/notifications
export async function getNotifications() {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const unreadCount = await prisma.digest.count({
      where: { userId, read: false },
    });

    const notifications = await prisma.digest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/notifications
export async function markAsRead(req: Request) {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { notificationId } = await req.json();

    if (notificationId && notificationId !== "ALL") {
      // Mark specific notification as read
      await prisma.digest.update({
        where: { id: notificationId, userId },
        data: { read: true },
      });
    } else {
      // Mark all as read
      await prisma.digest.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/notifications error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/notifications/trigger
export async function triggerManualDigest() {
  const session = await auth();
  if (!session || !session.user?.id || !session.user.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId, activeOrgId } = session.user;

  try {
    const content = await generateDigestForUser(userId, activeOrgId);
    return NextResponse.json({ success: true, content });
  } catch (err) {
    console.error("POST /api/notifications/trigger error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// GET/POST /api/cron/generate-digests
export async function runCronGenerateDigests(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET || "default_cron_secret";

  if (authHeader !== `Bearer ${cronSecret}`) {
    // Also check query param for easy manual testing / curls
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token");
    if (tokenParam !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const memberships = await prisma.membership.findMany();
    
    let successCount = 0;
    for (const m of memberships) {
      try {
        await generateDigestForUser(m.userId, m.orgId);
        successCount++;
      } catch (err) {
        console.error(`Failed to generate digest for user ${m.userId} in org ${m.orgId}:`, err);
      }
    }

    return NextResponse.json({ success: true, generatedCount: successCount, totalMemberships: memberships.length });
  } catch (err) {
    console.error("Cron job error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
