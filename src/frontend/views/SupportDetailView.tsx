"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Clock,
  MessageSquare,
  Share2,
  Trash2,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Send,
  Building,
  Shield,
  FileText,
  Lock,
  Unlock,
  ExternalLink
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: {
    name: string;
    email: string;
  };
}

interface Org {
  id: string;
  name: string;
}

interface Ticket {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: string;
  createdById: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt: string;
  isShared: boolean;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  org: {
    id: string;
    name: string;
  };
  comments: Comment[];
  shares: {
    id: string;
    sharedWithOrgId: string;
  }[];
}

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
}

export default function TicketDetail({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();

  // Core Page states
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit fields
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [updating, setUpdating] = useState(false);

  // Comments state
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Sharing state
  const [partnerOrgs, setPartnerOrgs] = useState<Org[]>([]);
  const [selectedShareOrgId, setSelectedShareOrgId] = useState("");
  const [sharing, setSharing] = useState(false);

  // Attachments state
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(false);
  const [attachUrl, setAttachUrl] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      loadTicketData();
      loadFeatureFlags();
    }
  }, [status, router, ticketId]);

  const loadTicketData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      const data = await res.json();
      if (res.ok) {
        setTicket(data.ticket);
        setEditTitle(data.ticket.title);
        setEditDescription(data.ticket.description);
        
        // If they are allowed to share, fetch their connected partner orgs
        const user = session?.user as any;
        const activeOrgId = user?.activeOrgId;
        const isOwner = data.ticket.orgId === activeOrgId;
        const activeMembership = user?.memberships?.find((m: any) => m.orgId === activeOrgId);
        const role = activeMembership?.role;
        const canShare = isOwner && (role === "ORG_ADMIN" || role === "SUPPORT_AGENT" || role === "PLATFORM_SUPER_ADMIN");
        
        if (canShare) {
          fetchPartnerOrgs();
        }
      } else {
        setError(data.error || "Failed to load ticket");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred while loading this ticket.");
    } finally {
      setLoading(false);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const res = await fetch("/api/feature-flags");
      const data = await res.json();
      if (res.ok) {
        const attachFlag = data.flags?.find((f: FeatureFlag) => f.key === "attachments_enabled");
        setAttachmentsEnabled(!!attachFlag?.enabled);
      }
    } catch (err) {
      console.error("Error loading feature flags:", err);
    }
  };

  const fetchPartnerOrgs = async () => {
    try {
      const res = await fetch("/api/connections/orgs");
      const data = await res.json();
      if (res.ok) {
        setPartnerOrgs(data.orgs || []);
        if (data.orgs && data.orgs.length > 0) {
          setSelectedShareOrgId(data.orgs[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading connected organizations:", err);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!ticket) return;
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        loadTicketData(); // Reload comments/audit trail
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating status");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editDescription.trim()) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setIsEditing(false);
        loadTicketData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating ticket");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!confirm("Are you sure you want to delete this ticket? This will perform a soft-delete and preserve the audit log.")) return;

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/support");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting ticket");
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        loadTicketData(); // Reload comments
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add comment");
      }
    } catch (err) {
      console.error(err);
      alert("Error adding comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleShareTicket = async () => {
    if (!selectedShareOrgId) return;

    setSharing(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithOrgId: selectedShareOrgId }),
      });
      if (res.ok) {
        loadTicketData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to share ticket");
      }
    } catch (err) {
      console.error(err);
      alert("Error sharing ticket");
    } finally {
      setSharing(false);
    }
  };

  const handleRevokeShare = async (orgId: string) => {
    if (!confirm("Are you sure you want to stop sharing this ticket with this partner organization?")) return;

    setSharing(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/share?orgId=${orgId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadTicketData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to revoke share");
      }
    } catch (err) {
      console.error(err);
      alert("Error revoking share");
    } finally {
      setSharing(false);
    }
  };

  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachUrl.trim() || !attachName.trim()) return;

    setAttaching(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentUrl: attachUrl, attachmentName: attachName }),
      });
      if (res.ok) {
        setAttachUrl("");
        setAttachName("");
        loadTicketData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add attachment link");
      }
    } catch (err) {
      console.error(err);
      alert("Error adding attachment");
    } finally {
      setAttaching(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading ticket...
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 p-6 text-center space-y-4">
        <div className="p-3 bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Ticket Not Found</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
          The ticket you are looking for does not exist, has been deleted, or you do not have permission to view it.
        </p>
        <Link
          href="/support"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Support Hub
        </Link>
      </div>
    );
  }

  if (!session) return null;
  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const isOwner = ticket.orgId === activeOrgId;
  
  const activeMembership = user.memberships?.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  const isCrossOrgGuest = userRole === "CROSS_ORG_GUEST";
  const isReviewer = userRole === "REVIEWER_APPROVER";

  const canEdit = isOwner && (userRole === "ORG_ADMIN" || userRole === "SUPPORT_AGENT" || userRole === "PLATFORM_SUPER_ADMIN");
  const canDelete = isOwner && (userRole === "ORG_ADMIN" || userRole === "PLATFORM_SUPER_ADMIN");
  const canShare = isOwner && (userRole === "ORG_ADMIN" || userRole === "SUPPORT_AGENT" || userRole === "PLATFORM_SUPER_ADMIN");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col transition-colors duration-300">
      <Navbar />
      <div className="flex-1 p-6 sm:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/support"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Support Hub
          </Link>
        </div>

        {/* Cross-Org Guest Warning Banner */}
        {ticket.isShared && isCrossOrgGuest && (
          <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-400 p-4 rounded-2xl text-sm">
            <Shield className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-semibold">Shared Ticket View:</span> You have limited access to this shared ticket. You can view the details and post comments, but modifications and status updates are restricted.
            </div>
          </div>
        )}

        {/* Core Ticket Area */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm p-6 sm:p-8 space-y-6 relative overflow-hidden">
          
          {/* Header Metadata */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">TICKET OWNER:</span>
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                  <Building className="w-3 h-3 text-zinc-400" />
                  {ticket.org.name}
                </span>
                {ticket.isShared && (
                  <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-md border border-purple-200/50 dark:border-purple-900/40">
                    SHARED WITH YOUR ORG
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="pt-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-2xl font-bold bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
                  />
                </div>
              ) : (
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight pt-2">
                  {ticket.title}
                </h1>
              )}
            </div>

            {/* Status Dropdown and Edit/Delete controls */}
            <div className="flex items-center gap-3 shrink-0 self-end sm:self-start">
              {/* Status Indicator / Selector */}
              {canEdit && !isCrossOrgGuest ? (
                <select
                  value={ticket.status}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              ) : (
                <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg uppercase tracking-wider">
                  {ticket.status}
                </span>
              )}

              {/* Admin Actions */}
              {canDelete && (
                <button
                  onClick={handleDeleteTicket}
                  className="p-2 border border-red-100 dark:border-red-950 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all cursor-pointer"
                  title="Delete Ticket (Soft Delete)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={5}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 border border-gray-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={updating}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                {ticket.description}
              </p>
              
              {canEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold cursor-pointer"
                >
                  Edit details
                </button>
              )}
            </div>
          )}

          {/* Metadata Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-800/20 border border-gray-100 dark:border-zinc-800/40 rounded-2xl p-4 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-zinc-400" />
              <span>Created by: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{ticket.createdBy.name} ({ticket.createdBy.email})</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span>Created on: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{new Date(ticket.createdAt).toLocaleString()}</span></span>
            </div>
          </div>

          {/* Ticket Attachments Section */}
          {attachmentsEnabled && (
            <div className="border-t border-gray-100 dark:border-zinc-800 pt-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Attachments
              </h3>

              {ticket.attachmentUrl ? (
                <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800/50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{ticket.attachmentName}</span>
                  </div>
                  <a
                    href={ticket.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-750 text-blue-600 dark:text-blue-400"
                  >
                    View Link
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">No attachments present on this ticket.</p>
              )}

              {/* Attachments link addition (For Support Agents / Admins) */}
              {canEdit && (
                <form onSubmit={handleAddAttachment} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <input
                    type="text"
                    required
                    placeholder="Attachment Name (e.g. Log Dump)"
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    className="sm:col-span-1 bg-gray-50 dark:bg-zinc-950 border border-gray-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none text-zinc-900 dark:text-zinc-50"
                  />
                  <input
                    type="url"
                    required
                    placeholder="Attachment Link URL (e.g. S3 / GDrive Link)"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    className="sm:col-span-1 bg-gray-50 dark:bg-zinc-950 border border-gray-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none text-zinc-900 dark:text-zinc-50"
                  />
                  <button
                    type="submit"
                    disabled={attaching}
                    className="bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold rounded-xl text-xs hover:bg-zinc-800 dark:hover:bg-zinc-150 transition-all py-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {attaching ? "Adding..." : "Add Link"}
                  </button>
                </form>
              )}
            </div>
          )}

        </div>

        {/* Ticket Sharing Section (Dashboard 1 Isolation & Connection) */}
        {canShare && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-500" />
              Cross-Organization Sharing
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Only organizations with an <span className="font-semibold text-emerald-500">approved connection</span> are eligible partners for sharing.
            </p>

            {/* List current shares */}
            {ticket.shares.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Shared with:</p>
                {ticket.shares.map((share) => {
                  // Find org name in partnerOrgs, or fallback
                  const partner = partnerOrgs.find(o => o.id === share.sharedWithOrgId);
                  return (
                    <div key={share.id} className="flex justify-between items-center bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/30 rounded-xl p-3.5 text-sm">
                      <span className="font-medium text-purple-700 dark:text-purple-400">
                        {partner ? partner.name : "Connected Partner Organization"}
                      </span>
                      <button
                        onClick={() => handleRevokeShare(share.sharedWithOrgId)}
                        disabled={sharing}
                        className="text-xs text-red-500 hover:text-red-600 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Revoke Access
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sharing select dropdown */}
            {partnerOrgs.length > 0 ? (
              <div className="flex items-center gap-3 pt-2">
                <select
                  value={selectedShareOrgId}
                  onChange={(e) => setSelectedShareOrgId(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none"
                >
                  {partnerOrgs
                    .filter((org) => !ticket.shares.some((s) => s.sharedWithOrgId === org.id))
                    .map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleShareTicket}
                  disabled={sharing || !selectedShareOrgId || ticket.shares.some((s) => s.sharedWithOrgId === selectedShareOrgId)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  Grant Access
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic">No connected partner organizations available. Establish an approved connection first.</p>
            )}
          </div>
        )}

        {/* Comments Section */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2 border-b border-gray-100 dark:border-zinc-800 pb-3">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            Comments & Discussion ({ticket.comments.length})
          </h2>

          {/* Comment Stream */}
          {ticket.comments.length === 0 ? (
            <p className="text-sm text-zinc-400 italic text-center py-6">No comments yet. Start the conversation below.</p>
          ) : (
            <div className="space-y-4">
              {ticket.comments.map((comment) => {
                const isCommentAuthorActive = comment.authorId === user.id;
                return (
                  <div key={comment.id} className="flex gap-3 items-start">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full shrink-0">
                      <User className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/30 border border-gray-100 dark:border-zinc-800/50 rounded-2xl p-4 space-y-1">
                      <div className="flex justify-between items-center gap-4 text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {comment.author.name} {isCommentAuthorActive && "(You)"}
                        </span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Comment Form (Visible to anyone who can read this ticket) */}
          <form onSubmit={handleAddComment} className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex gap-3">
            <input
              type="text"
              required
              disabled={submittingComment}
              placeholder={isReviewer ? "As a Reviewer, write comments here..." : "Add a reply..."}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={submittingComment || !newComment.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-95 cursor-pointer shrink-0 flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </div>
    </div>
  </div>
  );
}
