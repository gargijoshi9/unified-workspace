"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Settings, 
  Download, 
  User, 
  Clock, 
  Calendar, 
  Filter, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  GitPullRequest,
  Key
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface AuditLog {
  id: string;
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: any;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  };
  org: {
    id: string;
    name: string;
  };
}

interface ActorOption {
  id: string;
  name: string;
  email: string;
}

export default function AuditView() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [actorOptions, setActorOptions] = useState<ActorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters State
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedActorId, setSelectedActorId] = useState("ALL");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Expand state for JSON metadata
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      const user = session.user as any;
      setSelectedOrgId(user.activeOrgId);
    }
  }, [status, router]);

  useEffect(() => {
    if (selectedOrgId) {
      fetchAuditLogs();
    }
  }, [selectedOrgId, selectedActorId, selectedAction, startDate, endDate]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.append("orgId", selectedOrgId);
      if (selectedActorId !== "ALL") params.append("userId", selectedActorId);
      if (selectedAction !== "ALL") params.append("action", selectedAction);
      if (startDate) params.append("startDate", new Date(startDate).toISOString());
      if (endDate) {
        // Set end of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append("endDate", end.toISOString());
      }

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setActionOptions(data.actions || []);
        setActorOptions(data.actors || []);
      } else {
        setError(data.error || "Failed to fetch audit logs.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading audit logs.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      alert("No logs to export.");
      return;
    }

    const headers = ["Log ID", "Org Name", "Actor Name", "Actor Email", "Action", "Entity Type", "Entity ID", "Metadata", "Timestamp"];
    const rows = logs.map((log) => [
      log.id,
      log.org.name,
      log.actor.name,
      log.actor.email,
      log.action,
      log.entityType,
      log.entityId,
      log.metadata ? JSON.stringify(log.metadata) : "",
      new Date(log.createdAt).toISOString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `audit-log-${selectedOrgId}-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (status === "loading" || (loading && logs.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading audit logs...
        </div>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user as any;
  const activeMembership = user.memberships?.find((m: any) => m.orgId === user.activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  // Access Control: Org Admin, Reviewer/Approver, and Platform Super Admin allowed
  const hasAccess = userRole === "ORG_ADMIN" || userRole === "REVIEWER_APPROVER" || userRole === "PLATFORM_SUPER_ADMIN";

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="p-3 bg-rose-100 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl animate-bounce">
          <Key className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-sm">
          Audit logs are restricted to Administrators and Reviewers. Your current role is <strong className="text-zinc-800 dark:text-zinc-200">{userRole}</strong>.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-md"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workspace
        </Link>
      </div>
    );
  }

  // Group logs by Date
  const groupLogsByDate = (logList: AuditLog[]) => {
    const groups: { [key: string]: AuditLog[] } = {};
    logList.forEach((log) => {
      const dateString = new Date(log.createdAt).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      groups[dateString].push(log);
    });
    return groups;
  };

  const groupedLogs = groupLogsByDate(logs);

  const getActionBadgeClass = (action: string) => {
    if (action.includes("created")) {
      return "bg-blue-50 text-blue-700 border-blue-150 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50";
    }
    if (action.includes("deleted")) {
      return "bg-rose-50 text-rose-700 border-rose-150 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50";
    }
    if (action.includes("approved") || action.includes("merged")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-150 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50";
    }
    if (action.includes("shared") || action.includes("unshared")) {
      return "bg-purple-50 text-purple-700 border-purple-150 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/50";
    }
    return "bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/50";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col transition-colors duration-300">
      <Navbar />
      <div className="flex-1 p-6 sm:p-10">
        <div className="max-w-4xl mx-auto space-y-6">

        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-zinc-800 pb-6">
          <div className="space-y-1">
            <Link
              href="/review"
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Review Console
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-black dark:bg-white text-white dark:text-black rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Audit Console</h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Security and event tracking logs for the active organization
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-semibold rounded-xl text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-4 text-sm animate-shake">
            {error}
          </div>
        )}

        {/* Filters Toolbar */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <Filter className="w-3.5 h-3.5" />
            <span>Search Filters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Multi-Org Selection (if user has multiple orgs) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Organization</label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {user.memberships.map((m: any) => (
                  <option key={m.orgId} value={m.orgId}>{m.orgName}</option>
                ))}
              </select>
            </div>

            {/* Actor Selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Actor (User)</label>
              <select
                value={selectedActorId}
                onChange={(e) => setSelectedActorId(e.target.value)}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="ALL">All Actors</option>
                {actorOptions.map((actor) => (
                  <option key={actor.id} value={actor.id}>{actor.name}</option>
                ))}
              </select>
            </div>

            {/* Action Type Selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Action Type</label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="ALL">All Action Types</option>
                {actionOptions.map((act) => (
                  <option key={act} value={act}>{act}</option>
                ))}
              </select>
            </div>

            {/* Date Selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Date Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-[10px] focus:outline-none"
                />
                <span className="text-zinc-400 text-xs">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-[10px] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Timeline View */}
        {logs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No audit logs found for this filter combination.</p>
          </div>
        ) : (
          <div className="space-y-8 relative before:absolute before:inset-0 before:left-[17px] before:w-[2px] before:bg-gray-200 dark:before:bg-zinc-800 before:pointer-events-none pb-8">
            {Object.keys(groupedLogs).map((dateStr) => (
              <div key={dateStr} className="space-y-4">
                
                {/* Date Header */}
                <div className="relative pl-9 flex items-center">
                  <div className="absolute left-[11px] w-3.5 h-3.5 rounded-full border-[3px] border-black bg-white dark:border-white dark:bg-zinc-950 shrink-0"></div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest bg-gray-50 dark:bg-zinc-950 px-2 py-0.5 rounded -ml-2 select-none">
                    {dateStr}
                  </h4>
                </div>

                {/* Day's logs */}
                <div className="space-y-3 pl-9">
                  {groupedLogs[dateStr].map((log) => (
                    <div 
                      key={log.id} 
                      className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-2xl p-4 shadow-sm transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 border text-[9px] font-semibold rounded-full uppercase tracking-wider ${getActionBadgeClass(log.action)}`}>
                            {log.action}
                          </span>
                          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            by {log.actor.name} ({log.actor.email})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800/50 flex flex-wrap justify-between items-center gap-3 text-xs">
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                          <span>Entity:</span>
                          {log.entityType === "PR" ? (
                            <Link 
                              href={`/review/${log.entityId}`}
                              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              <GitPullRequest className="w-3.5 h-3.5" />
                              {log.entityType} ({log.entityId.slice(-6).toUpperCase()})
                            </Link>
                          ) : log.entityType === "Ticket" ? (
                            <Link 
                              href={`/support/${log.entityId}`}
                              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {log.entityType} ({log.entityId.slice(-6).toUpperCase()})
                            </Link>
                          ) : (
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {log.entityType} ({log.entityId.slice(-6).toUpperCase()})
                            </span>
                          )}
                        </div>

                        {log.metadata && (
                          <button
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-semibold cursor-pointer"
                          >
                            <span>Metadata</span>
                            {expandedLogId === log.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {/* Expanded JSON details */}
                      {expandedLogId === log.id && log.metadata && (
                        <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl overflow-x-auto text-[10px] font-mono text-zinc-600 dark:text-zinc-400 animate-in slide-in-from-top-1 duration-150">
                          <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  </div>
  );
}
