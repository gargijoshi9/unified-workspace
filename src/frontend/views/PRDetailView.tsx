"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Clock,
  Share2,
  CheckCircle,
  AlertTriangle,
  Building,
  Lock,
  GitPullRequest,
  Check,
  X,
  FileCode,
  ArrowRight,
  GitMerge
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface PRReviewer {
  id: string;
  userId: string;
  decision: string | null; // "approved" | "changes_requested" | null
  user: {
    name: string;
    email: string;
  };
}

interface PRVersion {
  id: string;
  versionNum: number;
  description: string;
  createdAt: string;
}

interface PRShare {
  id: string;
  sharedWithOrgId: string;
}

interface PR {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: string; // DRAFT | IN_REVIEW | APPROVED | REJECTED | MERGED
  authorId: string;
  requiredApprovals: number;
  createdAt: string;
  isShared: boolean;
  author: {
    id: string;
    name: string;
    email: string;
  };
  org: {
    id: string;
    name: string;
  };
  reviewers: PRReviewer[];
  versions: PRVersion[];
  shares: PRShare[];
}

interface Org {
  id: string;
  name: string;
}

interface ReviewerOption {
  id: string;
  name: string;
  email: string;
}

export default function PRDetail({ params }: { params: Promise<{ prId: string }> }) {
  const { prId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  const [pr, setPR] = useState<PR | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit fields
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [updating, setUpdating] = useState(false);

  // Reviewer assignment state
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([]);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [savingReviewers, setSavingReviewers] = useState(false);

  // Decision state
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approved" | "changes_requested">("approved");
  const [decisionComment, setDecisionComment] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Merging state
  const [merging, setMerging] = useState(false);

  // Sharing state
  const [partnerOrgs, setPartnerOrgs] = useState<Org[]>([]);
  const [selectedShareOrgId, setSelectedShareOrgId] = useState("");
  const [sharing, setSharing] = useState(false);

  // Diff view state
  const [selectedVersion, setSelectedVersion] = useState<PRVersion | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchPRDetails();
      fetchReviewersList();
      fetchPartnerOrgs();
    }
  }, [status, prId, router]);

  const fetchPRDetails = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/prs/${prId}`);
      const data = await res.json();
      if (res.ok) {
        setPR(data.pr);
        setEditTitle(data.pr.title);
        setEditDescription(data.pr.description);
        setSelectedReviewerIds(data.pr.reviewers.map((r: PRReviewer) => r.userId));
      } else {
        setError(data.error || "Failed to fetch Pull Request details.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading this Pull Request.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewersList = async () => {
    try {
      const res = await fetch("/api/users/reviewers");
      const data = await res.json();
      if (res.ok) {
        setReviewerOptions(data.reviewers || []);
      }
    } catch (err) {
      console.error("Failed to load reviewer list:", err);
    }
  };

  const fetchPartnerOrgs = async () => {
    try {
      const res = await fetch("/api/connections/orgs");
      const data = await res.json();
      if (res.ok) {
        setPartnerOrgs(data.orgs || []);
      }
    } catch (err) {
      console.error("Failed to load partner organizations:", err);
    }
  };

  const handleUpdatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDescription.trim()) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/prs/${prId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsEditing(false);
        fetchPRDetails(); // Refresh details (and versions)
      } else {
        alert(data.error || "Failed to update Pull Request");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating Pull Request");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveReviewers = async () => {
    setSavingReviewers(true);
    try {
      const res = await fetch(`/api/prs/${prId}/reviewers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerIds: selectedReviewerIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsAssigning(false);
        fetchPRDetails(); // Refresh reviewers and status
      } else {
        alert(data.error || "Failed to save reviewers");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving reviewers");
    } finally {
      setSavingReviewers(false);
    }
  };

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDecision(true);
    try {
      const res = await fetch(`/api/prs/${prId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decisionType, comment: decisionComment }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsDecisionModalOpen(false);
        setDecisionComment("");
        fetchPRDetails(); // Refresh status and decisions
      } else {
        alert(data.error || "Failed to submit decision");
      }
    } catch (err) {
      console.error(err);
      alert("Error submitting decision");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleMergePR = async () => {
    if (!confirm("Are you sure you want to merge this Pull Request?")) return;
    setMerging(true);
    try {
      const res = await fetch(`/api/prs/${prId}/merge`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        fetchPRDetails();
      } else {
        alert(data.error || "Failed to merge Pull Request");
      }
    } catch (err) {
      console.error(err);
      alert("Error merging Pull Request");
    } finally {
      setMerging(false);
    }
  };

  const handleSharePR = async () => {
    if (!selectedShareOrgId) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/prs/${prId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithOrgId: selectedShareOrgId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedShareOrgId("");
        fetchPRDetails();
      } else {
        alert(data.error || "Failed to share Pull Request");
      }
    } catch (err) {
      console.error(err);
      alert("Error sharing Pull Request");
    } finally {
      setSharing(false);
    }
  };

  const handleUnsharePR = async (orgId: string) => {
    if (!confirm("Are you sure you want to stop sharing this PR?")) return;
    try {
      const res = await fetch(`/api/prs/${prId}/share?orgId=${orgId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        fetchPRDetails();
      } else {
        alert(data.error || "Failed to remove share");
      }
    } catch (err) {
      console.error(err);
      alert("Error removing share");
    }
  };

  const handleReviewerCheckboxChange = (userId: string) => {
    setSelectedReviewerIds((prev) => 
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading Pull Request details...
        </div>
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="p-3 bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-2xl">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold">Pull Request Not Found</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm">
          {error || "This Pull Request does not exist, or you do not have permission to view it."}
        </p>
        <Link
          href="/review"
          className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-semibold transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review Console
        </Link>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const activeMembership = user.memberships?.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  const isOwner = pr.orgId === activeOrgId;
  const isAuthor = pr.authorId === user.id;
  const isAdmin = userRole === "ORG_ADMIN" || userRole === "PLATFORM_SUPER_ADMIN";

  // Actions allowed based on roles
  const canEdit = isOwner && (isAdmin || isAuthor);
  const canAssign = isOwner && (isAdmin || isAuthor);
  const canShare = isOwner && (isAdmin || isAuthor);
  const canMerge = isOwner && isAdmin && pr.status === "APPROVED";

  // Check if current user is an assigned reviewer
  const reviewerEntry = pr.reviewers.find((r) => r.userId === user.id);
  const isAssignedReviewer = !!reviewerEntry;
  const canSubmitDecision = isAssignedReviewer && pr.status !== "MERGED";

  // Share targets filtering (don't show orgs we've already shared with)
  const sharedOrgIds = pr.shares.map((s) => s.sharedWithOrgId);
  const shareOptions = partnerOrgs.filter((org) => !sharedOrgIds.includes(org.id));

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/50";
      case "IN_REVIEW":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50";
      case "APPROVED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50";
      case "REJECTED":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50";
      case "MERGED":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/50";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getDecisionStatusIcon = (decision: string | null) => {
    switch (decision) {
      case "approved":
        return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "changes_requested":
        return <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col transition-colors duration-300">
      <Navbar />
      <div className="flex-1 p-6 sm:p-10">
        <div className="max-w-6xl mx-auto space-y-6">

        {/* Back navigation */}
        <div className="flex justify-between items-center">
          <Link
            href="/review"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Review Console
          </Link>
          {pr.isShared && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 rounded-xl font-medium text-xs">
              <Building className="w-3.5 h-3.5" />
              <span>Shared from {pr.org.name} (Read-Only)</span>
            </div>
          )}
        </div>

        {/* Core Layout: Main details (left) + Side control panel (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left panel: Info & Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header Card */}
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-400">PR-{pr.id.slice(-6).toUpperCase()}</span>
                    <span className={`px-2 py-0.5 border text-[9px] font-semibold rounded-full uppercase tracking-wider ${getStatusBadgeClass(pr.status)}`}>
                      {pr.status}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight break-words">
                    {pr.title}
                  </h1>
                </div>

                {canMerge && (
                  <button
                    onClick={handleMergePR}
                    disabled={merging}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-purple-500/10 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <GitMerge className="w-4 h-4" />
                    {merging ? "Merging..." : "Merge PR"}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-y-2 gap-x-6 pt-4 border-t border-gray-100 dark:border-zinc-800 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="truncate">Author: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{pr.author.name}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span>Created: {new Date(pr.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Approvals: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{pr.reviewers.filter((r) => r.decision === "approved").length}/{pr.requiredApprovals} required</strong></span>
                </div>
              </div>
            </div>

            {/* Description / Content Card */}
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-zinc-800">
                <h3 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">PR Proposal</h3>
                {canEdit && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-zinc-500 hover:text-black dark:hover:text-white font-semibold transition-colors cursor-pointer"
                  >
                    Edit Proposal
                  </button>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleUpdatePR} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400">PR Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400">Description</label>
                    <textarea
                      rows={6}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-1.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating}
                      className="px-4 py-1.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-semibold rounded-xl text-xs transition-all cursor-pointer"
                    >
                      {updating ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {pr.description}
                </div>
              )}
            </div>

            {/* Version Diff / History Viewer */}
            {pr.versions.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-zinc-500 uppercase tracking-wider pb-3 border-b border-gray-100 dark:border-zinc-800">
                  Version History & Diff Viewer
                </h3>

                <div className="flex flex-wrap gap-2">
                  {pr.versions.map((ver) => (
                    <button
                      key={ver.id}
                      onClick={() => setSelectedVersion(selectedVersion?.id === ver.id ? null : ver)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                        selectedVersion?.id === ver.id
                          ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                          : "border-gray-200 hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      Version {ver.versionNum}
                    </button>
                  ))}
                </div>

                {selectedVersion && (
                  <div className="mt-4 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="bg-gray-50/50 dark:bg-zinc-900/50 px-4 py-2 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center text-xs text-zinc-400 font-mono">
                      <span>Diff: Version {selectedVersion.versionNum} vs Current</span>
                      <span>Snapshot on {new Date(selectedVersion.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-zinc-800">
                      {/* Before / Old */}
                      <div className="p-4 bg-rose-50/20 dark:bg-rose-950/5 space-y-2">
                        <div className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Before (Version {selectedVersion.versionNum})</div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                          {selectedVersion.description}
                        </div>
                      </div>
                      {/* After / Current */}
                      <div className="p-4 bg-emerald-50/20 dark:bg-emerald-950/5 space-y-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">After (Current)</div>
                        <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                          {pr.description}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Controls & Sharing */}
          <div className="space-y-6">

            {/* Reviewers List Card */}
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-zinc-800">
                <h3 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">Reviewers</h3>
                {canAssign && !isAssigning && (
                  <button
                    onClick={() => setIsAssigning(true)}
                    className="text-xs text-zinc-500 hover:text-black dark:hover:text-white font-semibold transition-colors cursor-pointer"
                  >
                    Manage
                  </button>
                )}
              </div>

              {isAssigning ? (
                <div className="space-y-4">
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 border border-zinc-100 dark:border-zinc-800 p-2.5 rounded-xl bg-zinc-50/30">
                    {reviewerOptions.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-4">No users in organization with Reviewer role.</p>
                    ) : (
                      reviewerOptions.map((opt) => (
                        <label key={opt.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedReviewerIds.includes(opt.id)}
                            onChange={() => handleReviewerCheckboxChange(opt.id)}
                            className="rounded text-zinc-900 focus:ring-zinc-500"
                          />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{opt.name}</p>
                            <p className="text-[10px] text-zinc-400 truncate">{opt.email}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAssigning(false)}
                      className="flex-1 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveReviewers}
                      disabled={savingReviewers}
                      className="flex-1 py-1.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      {savingReviewers ? "Saving..." : "Save List"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {pr.reviewers.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-4">No reviewers assigned. PR remains in Draft mode.</p>
                  ) : (
                    pr.reviewers.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-2.5 border border-zinc-100 dark:border-zinc-800/40 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{r.user.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">{r.user.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
                          {getDecisionStatusIcon(r.decision)}
                          <span className="capitalize font-medium text-[10px] tracking-tight">
                            {r.decision ? r.decision.replace("_", " ") : "Pending"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Reviewer Action Buttons */}
              {canSubmitDecision && (
                <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex gap-2">
                  <button
                    onClick={() => {
                      setDecisionType("approved");
                      setIsDecisionModalOpen(true);
                    }}
                    className="flex-1 flex justify-center items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setDecisionType("changes_requested");
                      setIsDecisionModalOpen(true);
                    }}
                    className="flex-1 flex justify-center items-center gap-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer active:scale-95"
                  >
                    <X className="w-3.5 h-3.5" />
                    Request Changes
                  </button>
                </div>
              )}
            </div>

            {/* Sharing Panel Card */}
            {canShare && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-zinc-500 uppercase tracking-wider pb-3 border-b border-gray-100 dark:border-zinc-800">
                  Sharing Management
                </h3>

                <div className="space-y-3">
                  {pr.shares.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-1">This PR is not shared with any partner organization.</p>
                  ) : (
                    pr.shares.map((share) => {
                      const orgName = partnerOrgs.find((o) => o.id === share.sharedWithOrgId)?.name || share.sharedWithOrgId;
                      return (
                        <div key={share.id} className="flex justify-between items-center p-2 border border-purple-100 dark:border-purple-900/30 rounded-xl bg-purple-50/10 dark:bg-purple-950/5">
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-medium truncate pr-2">{orgName}</span>
                          <button
                            onClick={() => handleUnsharePR(share.sharedWithOrgId)}
                            className="text-[10px] text-zinc-400 hover:text-red-500 transition-colors font-bold cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {shareOptions.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 flex gap-2">
                    <select
                      value={selectedShareOrgId}
                      onChange={(e) => setSelectedShareOrgId(e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
                    >
                      <option value="">Select partner org...</option>
                      {shareOptions.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleSharePR}
                      disabled={sharing || !selectedShareOrgId}
                      className="px-3 py-1.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Share
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Decision Modal */}
        {isDecisionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-900/50">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 capitalize">
                  {decisionType === "approved" ? "Approve PR" : "Request Changes"}
                </h3>
                <button 
                  onClick={() => setIsDecisionModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleSubmitDecision} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    {decisionType === "approved" ? "Comment (Optional)" : "Reason / Changes Requested (Recommended)"}
                  </label>
                  <textarea
                    rows={4}
                    required={decisionType === "changes_requested"}
                    placeholder={
                      decisionType === "approved" 
                        ? "Leave a note about your approval..." 
                        : "Describe what needs to change in detail before this PR can be approved..."
                    }
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50 resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsDecisionModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl text-sm transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDecision}
                    className={`px-5 py-2 font-semibold rounded-xl text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer text-white ${
                      decisionType === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {submittingDecision ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  </div>
  );
}
