import { auth } from "@/backend/modules/auth/auth.service";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { PRsService } from "./prsService";
import { NextResponse } from "next/server";

export async function getPRs() {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const prs = await PRsService.getPRs(user);
    return NextResponse.json({ prs });
  } catch (err) {
    console.error("GET /api/prs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function getPR(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const pr = await PRsService.getPR(id, user);
    if (!pr) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    return NextResponse.json({ pr });
  } catch (err) {
    console.error(`GET /api/prs/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function createPR(req: Request) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;

  try {
    const body = await req.json();
    const pr = await PRsService.createPR(user, body);
    return NextResponse.json({ pr }, { status: 201 });
  } catch (err) {
    console.error("POST /api/prs error:", err);
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function updatePR(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const body = await req.json();
    const result = await PRsService.updatePR(id, user, body);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ pr: result.pr });
  } catch (err) {
    console.error(`PATCH /api/prs/${id} error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function assignReviewers(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { reviewerIds } = await req.json();
    if (!reviewerIds || !Array.isArray(reviewerIds)) {
      return NextResponse.json({ error: "reviewerIds must be an array" }, { status: 400 });
    }

    const result = await PRsService.assignReviewers(id, user, reviewerIds);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (result.error === "InvalidReviewerRole") {
      return NextResponse.json({ error: "One or more users are not reviewer-approvers" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`POST /api/prs/${id}/reviewers error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function submitDecision(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { decision, comment } = await req.json();
    if (!decision || !comment) {
      return NextResponse.json({ error: "Missing decision or comment" }, { status: 400 });
    }

    const result = await PRsService.submitDecision(id, user, decision, comment);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden" || result.error === "ForbiddenReviewer") {
      const errorMsg =
        result.error === "ForbiddenReviewer"
          ? "You are not an assigned reviewer for this PR"
          : "Forbidden";
      return NextResponse.json({ error: errorMsg }, { status: 403 });
    }
    if (result.error === "InvalidDecision") {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: result.finalStatus });
  } catch (err) {
    console.error(`POST /api/prs/${id}/decision error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function mergePR(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const result = await PRsService.mergePR(id, user);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (result.error === "NotApproved") {
      return NextResponse.json({ error: "PR can only be merged when approved" }, { status: 400 });
    }

    return NextResponse.json({ pr: result.pr });
  } catch (err) {
    console.error(`POST /api/prs/${id}/merge error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function sharePR(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { sharedWithOrgId } = await req.json();
    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to share with is required" }, { status: 400 });
    }

    const result = await PRsService.sharePR(id, user, sharedWithOrgId);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (result.error === "SelfShare") {
      return NextResponse.json({ error: "Cannot share a PR with its owner organization" }, { status: 400 });
    }
    if (result.error === "NoApprovedConnection") {
      return NextResponse.json({ error: "No approved connection exists with this organization" }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`POST /api/prs/${id}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function unsharePR(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user?.activeOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as UserSession;
  const { id } = await params;

  try {
    const { sharedWithOrgId } = await req.json();
    if (!sharedWithOrgId) {
      return NextResponse.json({ error: "Organization to unshare with is required" }, { status: 400 });
    }

    const result = await PRsService.unsharePR(id, user, sharedWithOrgId);

    if (result.error === "NotFound") {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (result.error === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`DELETE /api/prs/${id}/share error:`, err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
