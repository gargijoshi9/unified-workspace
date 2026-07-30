import { auth } from "@/backend/auth";
import { prisma } from "@/backend/lib/prisma";
import { canPerform, UserSession } from "@/backend/lib/authz";
import { logAudit } from "@/backend/lib/audit";
import { NextResponse } from "next/server";
import { ConnectionStatus, PRStatus, Role } from "@prisma/client";

// GET /api/prs
export async function getPRs() {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    // 1. Fetch own organization's PRs
    const ownPRs = await prisma.pR.findMany({
      where: { orgId: activeOrgId },
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        shares: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch PRs shared with active organization
    const sharedShares = await prisma.pRShare.findMany({
      where: { sharedWithOrgId: activeOrgId },
      include: {
        pr: {
          include: {
            author: { select: { id: true, name: true, email: true } },
            org: { select: { id: true, name: true } },
            reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const own = ownPRs.map((p) => ({ ...p, isShared: false }));
    const shared = sharedShares.map((s) => ({ ...s.pr, isShared: true }));

    return NextResponse.json({ prs: [...own, ...shared] });
  } catch (err) {
    console.error("GET /api/prs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/prs
export async function createPR(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  if (!canPerform(user, "create_pr")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { title, description, requiredApprovals } = await req.json();

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const pr = await prisma.pR.create({
      data: {
        title,
        description,
        orgId: activeOrgId,
        authorId: user.id,
        status: PRStatus.DRAFT,
        requiredApprovals: Number(requiredApprovals) || 1,
      },
    });

    await logAudit(
      user.id,
      activeOrgId,
      "pr.created",
      "PR",
      pr.id,
      { title, requiredApprovals: pr.requiredApprovals }
    );

    return NextResponse.json({ pr }, { status: 201 });
  } catch (err) {
    console.error("POST /api/prs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// GET /api/prs/[id]
export async function getPR(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        org: { select: { id: true, name: true } },
        reviewers: { include: { user: { select: { id: true, name: true, email: true } } } },
        versions: { orderBy: { versionNum: "desc" } },
        shares: true,
      },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (
      !canPerform(user, "read_pr", {
        prOwnerOrgId: pr.orgId,
        isPrSharedWithActiveOrg: isShared,
      })
    ) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    return NextResponse.json({ pr: { ...pr, isShared } });
  } catch (err) {
    console.error(`GET /api/prs/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/prs/[id]
export async function updatePR(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (
      !canPerform(user, "edit_pr", {
        prOwnerOrgId: pr.orgId,
        prAuthorId: pr.authorId,
        isPrSharedWithActiveOrg: isShared,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, description } = await req.json();

    if (pr.status === PRStatus.DRAFT) {
      // Edit directly in draft
      const updatedPR = await prisma.pR.update({
        where: { id },
        data: {
          title: title !== undefined ? title : undefined,
          description: description !== undefined ? description : undefined,
        },
      });

      await logAudit(
        user.id,
        pr.orgId,
        "pr.updated",
        "PR",
        pr.id,
        { title: updatedPR.title }
      );

      return NextResponse.json({ pr: updatedPR });
    } else {
      // If review has started, create a version snapshot first
      const hasChanges = description !== undefined && description !== pr.description;
      
      if (hasChanges) {
        const versionCount = await prisma.pRVersion.count({ where: { prId: id } });
        await prisma.pRVersion.create({
          data: {
            prId: id,
            description: pr.description, // Current description
            versionNum: versionCount + 1,
          },
        });

        await logAudit(
          user.id,
          pr.orgId,
          "pr.version_created",
          "PR",
          pr.id,
          { versionNum: versionCount + 1, title: title || pr.title }
        );
      }

      const updatedPR = await prisma.pR.update({
        where: { id },
        data: {
          title: title !== undefined ? title : undefined,
          description: description !== undefined ? description : undefined,
        },
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

      return NextResponse.json({ pr: updatedPR });
    }
  } catch (err) {
    console.error(`PATCH /api/prs/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/prs/[id]/reviewers
export async function assignReviewers(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (
      !canPerform(user, "assign_reviewer", {
        prOwnerOrgId: pr.orgId,
        prAuthorId: pr.authorId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { reviewerIds } = await req.json();

    if (!Array.isArray(reviewerIds)) {
      return NextResponse.json({ error: "reviewerIds must be an array" }, { status: 400 });
    }

    // Verify all selected users belong to the org and have REVIEWER_APPROVER role
    const validReviewers = await prisma.membership.findMany({
      where: {
        orgId: pr.orgId,
        role: Role.REVIEWER_APPROVER,
        userId: { in: reviewerIds },
      },
    });

    if (validReviewers.length !== reviewerIds.length) {
      return NextResponse.json({ error: "One or more selected users are not valid reviewers" }, { status: 400 });
    }

    // Delete existing reviewers and create new ones
    await prisma.pRReviewer.deleteMany({ where: { prId: id } });

    await prisma.pRReviewer.createMany({
      data: reviewerIds.map((userId) => ({
        prId: id,
        userId,
        decision: null,
      })),
    });

    // Automatically transition to IN_REVIEW if in DRAFT
    let updatedStatus = pr.status;
    if (pr.status === PRStatus.DRAFT) {
      updatedStatus = PRStatus.IN_REVIEW;
      await prisma.pR.update({
        where: { id },
        data: { status: PRStatus.IN_REVIEW },
      });
    }

    await logAudit(
      user.id,
      pr.orgId,
      "pr.reviewers_assigned",
      "PR",
      pr.id,
      { reviewerCount: reviewerIds.length, status: updatedStatus }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`POST /api/prs/${id}/reviewers error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/prs/[id]/decision
export async function submitDecision(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id },
      include: { reviewers: true, shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    // Verify user is an assigned reviewer for this PR
    const reviewerEntry = pr.reviewers.find((r) => r.userId === user.id);
    if (!reviewerEntry) {
      return NextResponse.json({ error: "You are not an assigned reviewer for this PR" }, { status: 403 });
    }

    const { decision, comment } = await req.json();

    if (decision !== "approved" && decision !== "changes_requested") {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    // Update the reviewer decision
    await prisma.pRReviewer.update({
      where: { id: reviewerEntry.id },
      data: { decision },
    });

    // Fetch updated reviewers list to evaluate status
    const updatedPR = await prisma.pR.findUnique({
      where: { id },
      include: { reviewers: true },
    });

    if (!updatedPR) return NextResponse.json({ error: "PR not found" }, { status: 404 });

    let finalStatus = pr.status;

    if (decision === "changes_requested") {
      // Request changes kicks it back to IN_REVIEW (not APPROVED)
      finalStatus = PRStatus.IN_REVIEW;
      await prisma.pR.update({
        where: { id },
        data: { status: PRStatus.IN_REVIEW },
      });

      await logAudit(
        user.id,
        pr.orgId,
        "pr.changes_requested",
        "PR",
        pr.id,
        { comment: comment || undefined }
      );
    } else if (decision === "approved") {
      // Count approved reviewers
      const approvedCount = updatedPR.reviewers.filter((r) => r.decision === "approved").length;

      if (approvedCount >= pr.requiredApprovals) {
        finalStatus = PRStatus.APPROVED;
        await prisma.pR.update({
          where: { id },
          data: { status: PRStatus.APPROVED },
        });

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

    return NextResponse.json({ success: true, status: finalStatus });
  } catch (err) {
    console.error(`POST /api/prs/${id}/decision error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/prs/[id]/merge
export async function mergePR(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id },
      include: { shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (
      !canPerform(user, "merge_pr", {
        prOwnerOrgId: pr.orgId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (pr.status !== PRStatus.APPROVED) {
      return NextResponse.json({ error: "PR can only be merged when approved" }, { status: 400 });
    }

    const mergedPR = await prisma.pR.update({
      where: { id },
      data: { status: PRStatus.MERGED },
    });

    await logAudit(
      user.id,
      pr.orgId,
      "pr.merged",
      "PR",
      pr.id,
      { title: mergedPR.title }
    );

    return NextResponse.json({ pr: mergedPR });
  } catch (err) {
    console.error(`POST /api/prs/${id}/merge error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/prs/[id]/share
export async function sharePR(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: prId } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id: prId },
      include: { shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (
      !canPerform(user, "share_pr", {
        prOwnerOrgId: pr.orgId,
        prAuthorId: pr.authorId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { sharedWithOrgId } = await req.json();

    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to share with is required" }, { status: 400 });
    }

    if (sharedWithOrgId === pr.orgId) {
      return NextResponse.json({ error: "Cannot share a PR with its owner organization" }, { status: 400 });
    }

    // Verify there is an APPROVED connection between owner org and target org
    const connection = await prisma.orgConnection.findFirst({
      where: {
        status: ConnectionStatus.APPROVED,
        OR: [
          { orgAId: pr.orgId, orgBId: sharedWithOrgId },
          { orgAId: sharedWithOrgId, orgBId: pr.orgId },
        ],
      },
    });

    if (!connection) {
      return NextResponse.json({ error: "No approved connection exists with this organization" }, { status: 400 });
    }

    const prShare = await prisma.pRShare.upsert({
      where: {
        prId_sharedWithOrgId: {
          prId,
          sharedWithOrgId,
        },
      },
      create: {
        prId,
        sharedWithOrgId,
      },
      update: {},
    });

    await logAudit(
      user.id,
      pr.orgId,
      "pr.shared",
      "PR",
      prId,
      { sharedWithOrgId }
    );

    return NextResponse.json({ share: prShare }, { status: 201 });
  } catch (err) {
    console.error(`POST /api/prs/${prId}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/prs/[id]/share
export async function unsharePR(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: prId } = await params;
  const user = session.user as UserSession;
  const activeOrgId = user.activeOrgId;

  try {
    const pr = await prisma.pR.findUnique({
      where: { id: prId },
      include: { shares: true },
    });

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    const isOwner = pr.orgId === activeOrgId;
    const isShared = pr.shares.some((s) => s.sharedWithOrgId === activeOrgId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (
      !canPerform(user, "share_pr", {
        prOwnerOrgId: pr.orgId,
        prAuthorId: pr.authorId,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const sharedWithOrgId = url.searchParams.get("orgId");

    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to unshare with is required" }, { status: 400 });
    }

    await prisma.pRShare.deleteMany({
      where: {
        prId,
        sharedWithOrgId,
      },
    });

    await logAudit(
      user.id,
      pr.orgId,
      "pr.unshared",
      "PR",
      prId,
      { unsharedWithOrgId: sharedWithOrgId }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/prs/${prId}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
