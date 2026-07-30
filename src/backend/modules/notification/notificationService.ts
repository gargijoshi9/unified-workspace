import { NotificationRepository } from "./notificationRepository";
import { generateDigestForUser } from "@/backend/modules/ai/digest";

export class NotificationService {
  static async getNotifications(userId: string) {
    const unreadCount = await NotificationRepository.countUnreadDigests(userId);
    const notifications = await NotificationRepository.findManyDigests(userId, 10);
    return { notifications, unreadCount };
  }

  static async markAsRead(userId: string, notificationId?: string) {
    if (notificationId && notificationId !== "ALL") {
      await NotificationRepository.updateDigest(notificationId, userId, true);
    } else {
      await NotificationRepository.updateManyDigests(userId, true);
    }
    return { success: true };
  }

  static async triggerManualDigest(userId: string, activeOrgId: string) {
    const content = await generateDigestForUser(userId, activeOrgId);
    return { success: true, content };
  }

  static async runCronGenerateDigests(authHeader: string | null, tokenParam: string | null) {
    const cronSecret = process.env.CRON_SECRET || "default_cron_secret";
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` || tokenParam === cronSecret;

    if (!isAuthorized) {
      return { error: "Unauthorized" };
    }

    const memberships = await NotificationRepository.findAllMemberships();
    let successCount = 0;

    for (const m of memberships) {
      try {
        await generateDigestForUser(m.userId, m.orgId);
        successCount++;
      } catch (err) {
        console.error(`Failed to generate digest for user ${m.userId} in org ${m.orgId}:`, err);
      }
    }

    return {
      success: true,
      generatedCount: successCount,
      totalMemberships: memberships.length,
    };
  }
}
