"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Users, 
  ArrowLeft, 
  User, 
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  Settings
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface Ticket {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: string;
  createdById: string;
  createdAt: string;
  isShared: boolean;
  createdBy: {
    name: string;
    email: string;
  };
  org: {
    name: string;
  };
}

export default function SupportHub() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create Ticket modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchTickets();
    }
  }, [status, router]);

  const fetchTickets = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (res.ok) {
        setTickets(data.tickets || []);
      } else {
        setError(data.error || "Failed to fetch tickets");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading tickets.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDescription }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        fetchTickets(); // Refresh list
        router.push(`/support/${data.ticket.id}`); // Redirect to detail page
      } else {
        alert(data.error || "Failed to create ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating ticket");
    } finally {
      setCreating(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading tickets...
        </div>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const activeMembership = user.memberships?.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  // Check if user is allowed to create ticket
  const canCreate = userRole === "ORG_ADMIN" || userRole === "SUPPORT_AGENT" || userRole === "PLATFORM_SUPER_ADMIN";

  // Filtered tickets list
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50";
      case "IN_PROGRESS":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50";
      case "RESOLVED":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/50";
      case "CLOSED":
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/50";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-zinc-800/40";
    }
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
              <div className="p-2 bg-blue-600 rounded-xl text-white">
                <Layers className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Support Hub</h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage tickets for <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeMembership?.orgName}</span>
            </p>
          </div>

          <div className="flex gap-3">
            {userRole === "ORG_ADMIN" && (
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-900 font-medium rounded-xl text-sm transition-all"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            )}
            {canCreate && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Ticket
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
              placeholder="Search tickets by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-800 dark:text-zinc-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>

        {/* Ticket Lists */}
        {filteredTickets.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No tickets found matching the filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map((t) => (
              <div 
                key={t.id}
                onClick={() => router.push(`/support/${t.id}`)}
                className={`group flex flex-col justify-between p-6 bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  t.isShared 
                    ? "border-purple-200 dark:border-purple-900/40 hover:border-purple-300 dark:hover:border-purple-800" 
                    : "border-gray-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                      {t.title}
                    </h3>
                    <span className={`px-2 py-0.5 border text-[10px] font-semibold rounded-full uppercase tracking-wider shrink-0 ${getStatusBadgeClass(t.status)}`}>
                      {t.status}
                    </span>
                  </div>

                  <p className="text-zinc-500 dark:text-zinc-400 text-xs line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-zinc-800/50 flex items-center justify-between gap-4 text-[11px] text-zinc-400">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{t.createdBy.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                  {t.isShared ? (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 rounded-lg font-medium tracking-tight">
                      <Users className="w-3 h-3" />
                      <span>Shared from {t.org.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800/50 rounded-lg font-medium">
                      <span>Owner</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Ticket Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-2">
                <div className="p-1 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Create New Support Ticket</h2>
              </div>
              <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ticket Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Short, descriptive title..."
                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description</label>
                  <textarea
                    required
                    rows={4}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Explain the issue in detail..."
                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    {creating ? "Creating..." : "Submit Ticket"}
                    <ArrowRight className="w-4 h-4" />
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
