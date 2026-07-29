"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, 
  Search, 
  Filter, 
  GitPullRequest, 
  Users, 
  ArrowLeft, 
  User, 
  Clock,
  Settings,
  CheckCircle,
  FileCode
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface PR {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: string;
  authorId: string;
  requiredApprovals: number;
  createdAt: string;
  isShared: boolean;
  author: {
    name: string;
    email: string;
  };
  org: {
    name: string;
  };
  reviewers: {
    id: string;
    userId: string;
    decision: string | null;
    user: {
      name: string;
    };
  }[];
}

export default function PRListView() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [prs, setPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create PR modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRequiredApprovals, setNewRequiredApprovals] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchPRs();
    }
  }, [status, router]);

  const fetchPRs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/prs");
      const data = await res.json();
      if (res.ok) {
        setPRs(data.prs || []);
      } else {
        setError(data.error || "Failed to fetch Pull Requests");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading Pull Requests.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: newTitle, 
          description: newDescription,
          requiredApprovals: newRequiredApprovals 
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        setNewRequiredApprovals(1);
        fetchPRs(); // Refresh list
        router.push(`/review/${data.pr.id}`); // Redirect to detail page
      } else {
        alert(data.error || "Failed to create Pull Request");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating Pull Request");
    } finally {
      setCreating(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading Pull Requests...
        </div>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const activeMembership = user.memberships?.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  // Check if user is allowed to create PR (Admin or Reviewer)
  const canCreate = userRole === "ORG_ADMIN" || userRole === "REVIEWER_APPROVER" || userRole === "PLATFORM_SUPER_ADMIN";
  const canViewAudit = userRole === "ORG_ADMIN" || userRole === "REVIEWER_APPROVER" || userRole === "PLATFORM_SUPER_ADMIN";

  // Filtered PRs list
  const filteredPRs = prs.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || 
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-zinc-800/40";
    }
  };

  const getApprovalsCount = (pr: PR) => {
    return pr.reviewers.filter((r) => r.decision === "approved").length;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col transition-colors duration-300">
      <Navbar />
      <div className="flex-1 p-6 sm:p-10">
        <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-zinc-800 pb-6">
          <div className="space-y-1">
            <Link
              href="/"
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Workspace
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-xl">
                <GitPullRequest className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Review Console</h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage Pull Requests for <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeMembership?.orgName}</span>
            </p>
          </div>

          <div className="flex gap-3">
            {canViewAudit && (
              <Link
                href="/review/audit"
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-900 font-medium rounded-xl text-sm transition-all"
              >
                <Settings className="w-4 h-4" />
                Audit Log
              </Link>
            )}
            {canCreate && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-xl text-sm transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New Pull Request
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {/* Toolbar (Search & Filter) */}
        <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search PRs by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-800 dark:text-zinc-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="MERGED">Merged</option>
            </select>
          </div>
        </div>

        {/* PR Lists */}
        {filteredPRs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <FileCode className="w-5 h-5" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No Pull Requests found matching the filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPRs.map((p) => (
              <div 
                key={p.id}
                onClick={() => router.push(`/review/${p.id}`)}
                className={`group flex flex-col justify-between p-6 bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  p.isShared 
                    ? "border-purple-200 dark:border-purple-900/40 hover:border-purple-300 dark:hover:border-purple-800" 
                    : "border-gray-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                      {p.title}
                    </h3>
                    <span className={`px-2 py-0.5 border text-[10px] font-semibold rounded-full uppercase tracking-wider shrink-0 ${getStatusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                  </div>

                  <p className="text-zinc-500 dark:text-zinc-400 text-xs line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-zinc-400">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{p.author.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/30 text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                      <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{getApprovalsCount(p)}/{p.requiredApprovals} Approvals</span>
                    </div>
                    {p.isShared ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 rounded-lg font-medium tracking-tight">
                        <Users className="w-3 h-3" />
                        <span>Shared from {p.org.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800/50 rounded-lg font-medium">
                        <span>Owner</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create PR Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-900/50">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Create Pull Request</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreatePR} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">PR Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Add multi-org switcher component"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Description / Proposal</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Provide details about the proposed changes..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Required Approvals</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={newRequiredApprovals}
                      onChange={(e) => setNewRequiredApprovals(Math.max(1, Number(e.target.value)))}
                      className="w-24 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 text-zinc-900 dark:text-zinc-50"
                    />
                    <span className="text-xs text-zinc-400">Number of reviewer approvals required before merge is enabled.</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl text-sm transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-semibold rounded-xl text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {creating ? "Creating..." : "Create PR"}
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
