import { PRsRepository } from "./prsRepository";
import { prisma } from "@/backend/shared/prisma";
import { UserSession, AuthzContext } from "@/backend/modules/auth/auth.types";
import { canPerform } from "@/backend/modules/auth/authorize";
import { logAudit } from "@/backend/modules/audit/audit";
import { PRStatus, Role } from "@prisma/client";

export class PRsService {
  static async getPRs(user: UserSession) {
    const ownPRs = await PRsRepository.findMany({ orgId: user.activeOrgId });
    const sharedPRs = await PRsRepository.findMany({
      shares: {
        some: { sharedWithOrgId: user.activeOrgId },
      },
    });

    const allPRs = [...ownPRs];
    for (const spr of sharedPRs) {
      if (!allPRs.some((p) => p.id === spr.id)) {
        allPRs.push(spr);
      }
    }
    return allPRs;
  }

  static async getPR(id: string, user: UserSession) {
    const pr = await PRsRepository.findUnique(id);
    if (!pr) return null;

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (!canPerform(user, "read_pr", authzContext)) {
      return null;
    }

    return pr;
  }

  static async createPR(user: UserSession, payload: { title: string; description: string }) {
    if (!canPerform(user, "create_pr")) {
      throw new Error("Forbidden");
    }

    const pr = await PRsRepository.create({
      title: payload.title,
      description: payload.description,
      status: PRStatus.DRAFT,
      orgId: user.activeOrgId,
      authorId: user.id,
    });

    await logAudit(
      user.id,
      user.activeOrgId,
      "pr.created",
      "PR",
      pr.id,
      { title: payload.title }
    );

    return pr;
  }

  static async updatePR(
    id: string,
    user: UserSession,
    payload: { title?: string; description?: string }
  ) {
    const pr = await PRsRepository.findUnique(id);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "edit_pr", authzContext)) {
      return { error: "Forbidden" };
    }

    if (pr.status === PRStatus.DRAFT) {
      const updatedPR = await PRsRepository.update(id, {
        title: payload.title !== undefined ? payload.title : undefined,
        description: payload.description !== undefined ? payload.description : undefined,
      });

      await logAudit(
        user.id,
        pr.orgId,
        "pr.updated",
        "PR",
        pr.id,
        { title: updatedPR.title }
      );

      return { pr: updatedPR };
    } else {
      const hasChanges = payload.description !== undefined && payload.description !== pr.description;

      if (hasChanges) {
        const versionCount = await PRsRepository.countVersions(id);
        await PRsRepository.createVersion(id, versionCount + 1, pr.description);

        await logAudit(
          user.id,
          pr.orgId,
          "pr.version_created",
          "PR",
          pr.id,
          { versionNum: versionCount + 1, title: payload.title || pr.title }
        );
      }

      const updatedPR = await PRsRepository.update(id, {
        title: payload.title !== undefined ? payload.title : undefined,
        description: payload.description !== undefined ? payload.description : undefined,
      });

      if (!hasChanges) {
        await logAudit(
          user.id,
          pr.orgId,
          "pr.updated",
          "PR",
          pr.id,
          { title: updatedPR.title }
        );
      }

      return { pr: updatedPR };
    }
  }

  static async assignReviewers(prId: string, user: UserSession, reviewerIds: string[]) {
    const pr = await PRsRepository.findUnique(prId);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "assign_reviewer", authzContext)) {
      return { error: "Forbidden" };
    }

    // Verify all target reviewers have appropriate role (REVIEWER_APPROVER)
    for (const rid of reviewerIds) {
      const membership = await PRsRepository.getMembership(rid, user.activeOrgId);
      if (!membership || membership.role !== Role.REVIEWER_APPROVER) {
        return { error: "InvalidReviewerRole" };
      }
    }

    // Update reviewers
    await PRsRepository.deleteReviewers(prId);
    await PRsRepository.createReviewers(prId, reviewerIds);

    // If PR is in draft, move it to IN_REVIEW automatically
    let prToReturn = pr;
    if (pr.status === PRStatus.DRAFT) {
      prToReturn = await PRsRepository.update(prId, { status: PRStatus.IN_REVIEW });
    }

    await logAudit(
      user.id,
      user.activeOrgId,
      "pr.reviewers_assigned",
      "PR",
      prId,
      { reviewerIds }
    );

    return { success: true, pr: prToReturn };
  }

  static async submitDecision(prId: string, user: UserSession, decision: string, comment: string) {
    const pr = await PRsRepository.findUnique(prId);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "submit_decision", authzContext)) {
      return { error: "Forbidden" };
    }

    const reviewerEntry = pr.reviewers.find((r) => r.userId === user.id);
    if (!reviewerEntry) {
      return { error: "ForbiddenReviewer" };
    }

    if (decision !== "approved" && decision !== "changes_requested") {
      return { error: "InvalidDecision" };
    }

    await PRsRepository.updateReviewerDecision(reviewerEntry.id, decision);

    // Fetch updated PR reviewers count
    const updatedPR = await PRsRepository.findUnique(prId);
    if (!updatedPR) return { error: "NotFound" };

    let finalStatus = pr.status;

    if (decision === "changes_requested") {
      finalStatus = PRStatus.IN_REVIEW;
      await PRsRepository.update(prId, { status: PRStatus.IN_REVIEW });

      await logAudit(
        user.id,
        pr.orgId,
        "pr.changes_requested",
        "PR",
        pr.id,
        { comment: comment || undefined }
      );
    } else if (decision === "approved") {
      const approvedCount = updatedPR.reviewers.filter((r) => r.decision === "approved").length;

      if (approvedCount >= pr.requiredApprovals) {
        finalStatus = PRStatus.APPROVED;
        await PRsRepository.update(prId, { status: PRStatus.APPROVED });

        await logAudit(
          user.id,
          pr.orgId,
          "pr.approved",
          "PR",
          pr.id,
          { approvalsCount: approvedCount, status: PRStatus.APPROVED }
        );
      } else {
        await logAudit(
          user.id,
          pr.orgId,
          "pr.approved",
          "PR",
          pr.id,
          { approvalsCount: approvedCount, required: pr.requiredApprovals }
        );
      }
    }

    return { finalStatus };
  }

  static async mergePR(prId: string, user: UserSession) {
    const pr = await PRsRepository.findUnique(prId);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "merge_pr", authzContext)) {
      return { error: "Forbidden" };
    }

    if (pr.status !== PRStatus.APPROVED) {
      return { error: "NotApproved" };
    }

    const mergedPr = await PRsRepository.update(prId, { status: PRStatus.MERGED });

    await logAudit(
      user.id,
      pr.orgId,
      "pr.merged",
      "PR",
      pr.id,
      { title: mergedPr.title }
    );

    return { pr: mergedPr };
  }

  static async sharePR(prId: string, user: UserSession, sharedWithOrgId: string) {
    const pr = await PRsRepository.findUnique(prId);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "share_pr", authzContext)) {
      return { error: "Forbidden" };
    }

    if (sharedWithOrgId === pr.orgId) {
      return { error: "SelfShare" };
    }

    // Verify connections exist
    const connection = await prisma.orgConnection.findFirst({
      where: {
        status: "APPROVED",
        OR: [
          { orgAId: pr.orgId, orgBId: sharedWithOrgId },
          { orgAId: sharedWithOrgId, orgBId: pr.orgId },
        ],
      },
    });

    if (!connection) {
      return { error: "NoApprovedConnection" };
    }

    await PRsRepository.createShare(prId, sharedWithOrgId);

    await logAudit(
      user.id,
      pr.orgId,
      "pr.shared",
      "PR",
      prId,
      { sharedWithOrgId }
    );

    return { success: true };
  }

  static async unsharePR(prId: string, user: UserSession, sharedWithOrgId: string) {
    const pr = await PRsRepository.findUnique(prId);
    if (!pr) return { error: "NotFound" };

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === user.activeOrgId);
    const authzContext: AuthzContext = {
      prOwnerOrgId: pr.orgId,
      isPrSharedWithActiveOrg: isShared,
      prAuthorId: pr.authorId,
    };

    if (pr.orgId !== user.activeOrgId && !isShared) {
      return { error: "NotFound" };
    }

    if (!canPerform(user, "share_pr", authzContext)) {
      return { error: "Forbidden" };
    }

    await PRsRepository.deleteShares(prId, sharedWithOrgId);

    await logAudit(
      user.id,
      pr.orgId,
      "pr.unshared",
      "PR",
      prId,
      { unsharedWithOrgId: sharedWithOrgId }
    );

    return { success: true };
  }
}
