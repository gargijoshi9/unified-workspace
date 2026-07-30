import { auth } from "@/backend/modules/auth/auth.service";
import { NotificationService } from "./notificationService";
import { NextResponse } from "next/server";

export async function getNotifications() {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await NotificationService.getNotifications(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function markAsRead(req: Request) {
  const session = await auth();
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { notificationId } = await req.json();
    const result = await NotificationService.markAsRead(session.user.id, notificationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/notifications error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function triggerManualDigest() {
  const session = await auth();
  if (!session || !session.user?.id || !session.user.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId, activeOrgId } = session.user;

  try {
    const result = await NotificationService.triggerManualDigest(userId, activeOrgId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/notifications/trigger error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function runCronGenerateDigests(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");

  try {
    const result = await NotificationService.runCronGenerateDigests(authHeader, tokenParam);

    if ("error" in result) {
      if (result.error === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Cron job error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
