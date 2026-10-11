import { prisma } from "@/backend/shared/prisma";
import { redis } from "@/backend/shared/redis";
import { Role, InvitationStatus } from "@prisma/client";
import { UserSession } from "@/backend/modules/auth/auth.types";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const INVITATION_EXPIRY_DAYS = 7;

export class MembersService {
  /**
   * Fetch all members and pending invitations for the user's active organization.
   */
  static async getMembers(user: UserSession) {
    const orgId = user.activeOrgId;

    // Automatically update expired invitations
    await prisma.invitation.updateMany({
      where: {
        orgId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: InvitationStatus.EXPIRED,
      },
    });

    const [memberships, invitations] = await Promise.all([
      prisma.membership.findMany({
        where: { orgId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      }),
      prisma.invitation.findMany({
        where: { orgId },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      members: memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt,
      })),
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        name: inv.name,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        invitedBy: inv.invitedBy,
      })),
    };
  }

  /**
   * Invite a new member to the active organization.
   */
  static async inviteMember(
    user: UserSession,
    data: { email: string; name?: string; role: Role }
  ) {
    const orgId = user.activeOrgId;

    if (!data.email || typeof data.email !== "string") {
      throw new Error("INVALID_EMAIL");
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error("INVALID_EMAIL_FORMAT");
    }

    // Role restrictions: ORG_ADMIN can only invite SUPPORT_AGENT, REVIEWER_APPROVER, or ORG_ADMIN
    if (data.role !== Role.SUPPORT_AGENT && data.role !== Role.REVIEWER_APPROVER && data.role !== Role.ORG_ADMIN) {
      throw new Error("UNAUTHORIZED_ROLE_ASSIGNMENT");
    }

    // Check if user is already an active member of this organization
    const existingMembership = await prisma.membership.findFirst({
      where: {
        orgId,
        user: { email: normalizedEmail },
        isActive: true,
      },
    });

    if (existingMembership) {
      throw new Error("MEMBER_ALREADY_EXISTS");
    }

    // Cancel any existing pending invitation for this email in this org
    await prisma.invitation.updateMany({
      where: {
        orgId,
        email: normalizedEmail,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.CANCELLED,
      },
    });

    // Generate single-use cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        orgId,
        email: normalizedEmail,
        name: data.name?.trim() || null,
        role: data.role,
        tokenHash,
        invitedById: user.id,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
      include: {
        org: { select: { name: true } },
      },
    });

    // Emit immutable audit log
    await prisma.auditLog.create({
      data: {
        orgId,
        actorId: user.id,
        action: "member.invited",
        entityType: "Invitation",
        entityId: invitation.id,
        metadata: {
          inviteeEmail: normalizedEmail,
          assignedRole: data.role,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteLink = `${baseUrl}/accept-invitation?token=${rawToken}`;

    // Dispatches via Resend if configured
    if (process.env.RESEND_API_KEY) {
      const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [normalizedEmail],
            subject: `You've been invited to join ${invitation.org.name} on Unified Workspace`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
                <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 12px;">Team Invitation</h2>
                <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">Hello ${data.name || "there"},</p>
                <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">You have been invited by <strong>${user.name || user.email}</strong> to join <strong>${invitation.org.name}</strong> as a <strong>${data.role}</strong>.</p>
                <div style="margin: 28px 0;">
                  <a href="${inviteLink}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Accept Invitation</a>
                </div>
                <p style="font-size: 12px; color: #6b7280; line-height: 1.5;">This single-use invitation link expires in 7 days.<br/><a href="${inviteLink}" style="color: #2563eb; word-break: break-all;">${inviteLink}</a></p>
              </div>
            `,
          }),
        });
      } catch (err) {
        console.error("[MembersService] Failed to dispatch invitation email:", err);
      }
    } else {
      console.log(`[MembersService] Notice: RESEND_API_KEY not configured. Invitation created for ${normalizedEmail}.`);
    }

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
      // Safely expose inviteLink ONLY in development/testing mode for convenience
      ...(process.env.NODE_ENV !== "production" ? { inviteLink } : {}),
    };
  }

  /**
   * Resend an invitation with a refreshed token and extended expiration.
   */
  static async resendInvitation(user: UserSession, invitationId: string) {
    const orgId = user.activeOrgId;

    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, orgId },
      include: { org: { select: { name: true } } },
    });

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new Error("INVITATION_ALREADY_ACCEPTED");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const updated = await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt,
        status: InvitationStatus.PENDING,
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorId: user.id,
        action: "member.invitation_resent",
        entityType: "Invitation",
        entityId: updated.id,
        metadata: { email: updated.email, role: updated.role },
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteLink = `${baseUrl}/accept-invitation?token=${rawToken}`;

    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",
            to: [updated.email],
            subject: `Reminder: Invitation to join ${invitation.org.name}`,
            html: `<p>Click here to accept your invitation: <a href="${inviteLink}">${inviteLink}</a></p>`,
          }),
        });
      } catch (err) {
        console.error("[MembersService] Failed to resend email:", err);
      }
    }

    return {
      success: true,
      invitation: updated,
      ...(process.env.NODE_ENV !== "production" ? { inviteLink } : {}),
    };
  }

  /**
   * Cancel a pending invitation.
   */
  static async cancelInvitation(user: UserSession, invitationId: string) {
    const orgId = user.activeOrgId;

    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, orgId },
    });

    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    const updated = await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.CANCELLED },
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorId: user.id,
        action: "member.invitation_cancelled",
        entityType: "Invitation",
        entityId: updated.id,
        metadata: { email: updated.email },
      },
    });

    return { success: true };
  }

  /**
   * Update an existing member's role or active status.
   */
  static async updateMember(
    user: UserSession,
    membershipId: string,
    data: { role?: Role; isActive?: boolean }
  ) {
    const orgId = user.activeOrgId;

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, orgId },
      include: { user: true },
    });

    if (!membership) {
      throw new Error("MEMBERSHIP_NOT_FOUND");
    }

    // Privilege escalation prevention
    if (data.role && data.role === Role.PLATFORM_SUPER_ADMIN) {
      throw new Error("PRIVILEGE_ESCALATION_FORBIDDEN");
    }

    // Prevent removing the last active ORG_ADMIN
    if (
      membership.role === Role.ORG_ADMIN &&
      (data.isActive === false || (data.role && data.role !== Role.ORG_ADMIN))
    ) {
      const activeAdminsCount = await prisma.membership.count({
        where: {
          orgId,
          role: Role.ORG_ADMIN,
          isActive: true,
        },
      });

      if (activeAdminsCount <= 1) {
        throw new Error("CANNOT_REMOVE_LAST_ADMIN");
      }
    }

    // Prevent admin from deactivating themselves
    if (membership.userId === user.id && data.isActive === false) {
      throw new Error("CANNOT_DEACTIVATE_SELF");
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: {
        ...(data.role ? { role: data.role } : {}),
        ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
      },
    });

    // Invalidate target user's active sessions immediately in Redis
    try {
      const redisKey = `user:session-version:${membership.userId}`;
      await redis.incr(redisKey);
    } catch (e) {
      console.error("[MembersService] Redis session invalidation error:", e);
    }

    // Emit audit log
    const action =
      data.isActive === false
        ? "member.deactivated"
        : data.isActive === true
        ? "member.reactivated"
        : "member.role_updated";

    await prisma.auditLog.create({
      data: {
        orgId,
        actorId: user.id,
        action,
        entityType: "Membership",
        entityId: updated.id,
        metadata: {
          targetUserId: membership.userId,
          targetEmail: membership.user.email,
          newRole: updated.role,
          isActive: updated.isActive,
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
      isActive: updated.isActive,
    };
  }

  /**
   * Verify an invitation token (Public endpoint for /accept-invitation).
   */
  static async verifyInvitationToken(rawToken: string) {
    if (!rawToken || typeof rawToken !== "string") {
      return { valid: false, error: "Invalid invitation token" };
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        org: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return { valid: false, error: "Invitation not found" };
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return {
        valid: false,
        error: `Invitation has already been ${invitation.status.toLowerCase()}`,
      };
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      return { valid: false, error: "This invitation link has expired" };
    }

    return {
      valid: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        orgName: invitation.org.name,
        orgId: invitation.org.id,
      },
    };
  }

  /**
   * Accept an invitation and securely configure user account and password.
   */
  static async acceptInvitation(data: {
    token: string;
    name?: string;
    password?: string;
  }) {
    if (!data.token || typeof data.token !== "string") {
      throw new Error("INVALID_TOKEN");
    }

    const tokenHash = crypto.createHash("sha256").update(data.token).digest("hex");

    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        include: { org: true },
      });

      if (!invitation || invitation.status !== InvitationStatus.PENDING) {
        throw new Error("INVITATION_NOT_AVAILABLE");
      }

      if (invitation.expiresAt < new Date()) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED },
        });
        throw new Error("INVITATION_EXPIRED");
      }

      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });

      if (!user) {
        // First-time user: password is required
        if (!data.password || typeof data.password !== "string" || data.password.length < 8) {
          throw new Error("PASSWORD_REQUIREMENTS_NOT_MET");
        }

        if (!/[A-Za-z]/.test(data.password) || !/[0-9]/.test(data.password)) {
          throw new Error("PASSWORD_COMPLEXITY_NOT_MET");
        }

        const passwordHash = await bcrypt.hash(data.password, 12);
        const name = (data.name || invitation.name || "Team Member").trim();

        user = await tx.user.create({
          data: {
            email: invitation.email,
            name,
            passwordHash,
          },
        });
      }

      // Check for existing membership in this specific organization
      const existingMembership = await tx.membership.findUnique({
        where: {
          userId_orgId: {
            userId: user.id,
            orgId: invitation.orgId,
          },
        },
      });

      if (existingMembership) {
        if (!existingMembership.isActive) {
          // Reactivate with newly invited role
          await tx.membership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              role: invitation.role,
            },
          });
        }
      } else {
        // Create new membership strictly with the assigned invitation role
        await tx.membership.create({
          data: {
            userId: user.id,
            orgId: invitation.orgId,
            role: invitation.role,
            isActive: true,
          },
        });
      }

      // Invalidate invitation single-use token
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
        },
      });

      // Append audit log
      await tx.auditLog.create({
        data: {
          orgId: invitation.orgId,
          actorId: user.id,
          action: "member.invitation_accepted",
          entityType: "Membership",
          entityId: user.id,
          metadata: {
            email: user.email,
            role: invitation.role,
            orgName: invitation.org.name,
          },
        },
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        org: {
          id: invitation.org.id,
          name: invitation.org.name,
          role: invitation.role,
        },
      };
    }, {
      maxWait: 15000,
      timeout: 20000,
    });
  }
}
