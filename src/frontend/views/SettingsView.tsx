"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  Shield,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  AlertOctagon,
  Sparkles,
  Users,
  UserPlus,
  Mail,
  UserCheck,
  UserX,
  Clock,
  RefreshCw,
  X,
  Copy,
  Check,
  AlertCircle,
  ChevronDown
} from "lucide-react";
import Navbar from "@/frontend/components/Navbar";

interface FeatureFlag {
  id?: string;
  key: string;
  enabled: boolean;
}

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: {
    name?: string | null;
    email: string;
  };
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Tab State
  const [activeTab, setActiveTab] = useState<"members" | "flags">("members");

  // Feature Flags State
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [updatingFlagKey, setUpdatingFlagKey] = useState<string | null>(null);

  // Members State
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("SUPPORT_AGENT");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccessLink, setInviteSuccessLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Deactivate Modal State
  const [deactivatingMember, setDeactivatingMember] = useState<TeamMember | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Edit Role State
  const [editingRoleMember, setEditingRoleMember] = useState<TeamMember | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [roleUpdateLoading, setRoleUpdateLoading] = useState(false);

  // General Notification Banner
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchFlags();
      fetchMembers();
    }
  }, [status, router]);

  const showBanner = (type: "success" | "error", text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 6000);
  };

  const fetchFlags = async () => {
    setFlagsLoading(true);
    try {
      const res = await fetch("/api/feature-flags");
      const data = await res.json();
      if (res.ok) {
        const dbFlags = data.flags || [];
        const defaultKeys = ["dark_mode_enabled", "attachments_enabled"];
        const mergedFlags: FeatureFlag[] = defaultKeys.map((key) => {
          const found = dbFlags.find((f: any) => f.key === key);
          return {
            key,
            enabled: found ? found.enabled : false,
          };
        });
        setFlags(mergedFlags);
      }
    } catch (err) {
      console.error("fetchFlags error:", err);
    } finally {
      setFlagsLoading(false);
    }
  };

  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const res = await fetch("/api/organization/members");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error("fetchMembers error:", err);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleToggleFlag = async (key: string, currentEnabled: boolean) => {
    setUpdatingFlagKey(key);
    try {
      const res = await fetch("/api/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: !currentEnabled }),
      });
      if (res.ok) {
        setFlags((prev) =>
          prev.map((f) => (f.key === key ? { ...f, enabled: !currentEnabled } : f))
        );
        showBanner("success", `Feature flag '${key}' updated successfully.`);
      } else {
        const data = await res.json();
        showBanner("error", data.error || "Failed to update feature flag");
      }
    } catch {
      showBanner("error", "Error updating feature flag");
    } finally {
      setUpdatingFlagKey(null);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccessLink(null);
    setInviteSubmitting(true);

    try {
      const res = await fetch("/api/organization/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          name: inviteName.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error || "Failed to send invitation.");
        setInviteSubmitting(false);
        return;
      }

      setInviteSubmitting(false);
      if (data.inviteLink) {
        setInviteSuccessLink(data.inviteLink);
      } else {
        setInviteModalOpen(false);
        setInviteEmail("");
        setInviteName("");
        showBanner("success", `Invitation sent successfully to ${inviteEmail}.`);
      }
      fetchMembers();
    } catch {
      setInviteError("An unexpected network error occurred.");
      setInviteSubmitting(false);
    }
  };

  const handleResendInvite = async (invitationId: string, email: string) => {
    try {
      const res = await fetch("/api/organization/members/invite/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });

      const data = await res.json();
      if (res.ok) {
        showBanner("success", `Invitation resent to ${email}. Token refreshed.`);
        if (data.inviteLink) {
          navigator.clipboard.writeText(data.inviteLink);
          showBanner("success", `Invitation resent! Dev link copied to clipboard.`);
        }
        fetchMembers();
      } else {
        showBanner("error", data.error || "Failed to resend invitation.");
      }
    } catch {
      showBanner("error", "Network error resending invitation.");
    }
  };

  const handleCancelInvite = async (invitationId: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation for ${email}?`)) return;

    try {
      const res = await fetch(`/api/organization/members/invite?id=${invitationId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showBanner("success", `Invitation for ${email} has been cancelled.`);
        fetchMembers();
      } else {
        const data = await res.json();
        showBanner("error", data.error || "Failed to cancel invitation.");
      }
    } catch {
      showBanner("error", "Network error cancelling invitation.");
    }
  };

  const handleToggleDeactivate = async () => {
    if (!deactivatingMember) return;
    setDeactivateLoading(true);
    setActionError("");

    const newActiveState = !deactivatingMember.isActive;

    try {
      const res = await fetch(`/api/organization/members/${deactivatingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newActiveState }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error || "Failed to update member status.");
        setDeactivateLoading(false);
        return;
      }

      setDeactivateLoading(false);
      const memberName = deactivatingMember.name || deactivatingMember.email;
      setDeactivatingMember(null);
      showBanner(
        "success",
        newActiveState
          ? `${memberName} has been reactivated.`
          : `${memberName} has been deactivated and all active sessions revoked.`
      );
      fetchMembers();
    } catch {
      setActionError("Network error updating member status.");
      setDeactivateLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRoleMember || !selectedRole) return;
    setRoleUpdateLoading(true);
    setActionError("");

    try {
      const res = await fetch(`/api/organization/members/${editingRoleMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error || "Failed to update member role.");
        setRoleUpdateLoading(false);
        return;
      }

      setRoleUpdateLoading(false);
      setEditingRoleMember(null);
      showBanner("success", `Role updated to ${selectedRole}. User session refreshed.`);
      fetchMembers();
    } catch {
      setActionError("Network error updating role.");
      setRoleUpdateLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading settings...
        </div>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const activeMembership = user.memberships?.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";
  const isOrgAdmin = userRole === "ORG_ADMIN" || userRole === "PLATFORM_SUPER_ADMIN";

  if (!isOrgAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 p-6 text-center space-y-4">
        <div className="p-3 bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Access Denied</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
          You must be an Organization Administrator to view or manage settings for this tenant.
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

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ORG_ADMIN":
        return "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40";
      case "SUPPORT_AGENT":
        return "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40";
      case "REVIEWER_APPROVER":
        return "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40";
      case "CROSS_ORG_GUEST":
        return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
      default:
        return "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col transition-colors duration-300">
      <Navbar />

      <div className="flex-1 p-6 sm:p-10">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Top Back Navigation */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 pb-5">
            <div className="space-y-1">
              <Link
                href="/support"
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Support Hub
              </Link>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Organization Settings</h1>
              </div>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                Manage members, roles, and security policies for{" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeMembership?.orgName}</span>
              </p>
            </div>
          </div>

          {/* Global Notification Banner */}
          {banner && (
            <div
              className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between transition-all ${
                banner.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200"
                  : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {banner.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                )}
                <span>{banner.text}</span>
              </div>
              <button
                onClick={() => setBanner(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab("members")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                activeTab === "members"
                  ? "border-black dark:border-white text-zinc-900 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Users className="w-4 h-4" />
              Team Members
              <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {members.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("flags")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                activeTab === "flags"
                  ? "border-black dark:border-white text-zinc-900 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Shield className="w-4 h-4" />
              Feature Flags
              <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {flags.length}
              </span>
            </button>
          </div>

          {/* TAB 1: TEAM MEMBERS */}
          {activeTab === "members" && (
            <div className="space-y-6">

              {/* Members Header Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Organization Members
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Invite, configure roles, or deactivate team access for this workspace.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setInviteModalOpen(true);
                    setInviteError("");
                    setInviteSuccessLink(null);
                  }}
                  className="flex items-center gap-2 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-xl px-3.5 py-2 text-xs sm:text-sm transition-all shadow-sm cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite Member
                </button>
              </div>

              {/* Active Members Table */}
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-500" />
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      Active Members ({members.length})
                    </span>
                  </div>
                  {membersLoading && (
                    <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin" />
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs">
                        <th className="py-3 px-4 font-medium">User</th>
                        <th className="py-3 px-4 font-medium">Role</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                      {members.map((m) => {
                        const isSelf = m.userId === user.id;
                        return (
                          <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                                {m.name || "Team Member"}
                                {isSelf && (
                                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                                {m.email}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getRoleBadge(
                                  m.role
                                )}`}
                              >
                                {m.role}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              {m.isActive ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                  Deactivated
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setEditingRoleMember(m);
                                    setSelectedRole(m.role);
                                    setActionError("");
                                  }}
                                  className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white px-2.5 py-1 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                >
                                  Edit Role
                                </button>

                                <button
                                  onClick={() => {
                                    setDeactivatingMember(m);
                                    setActionError("");
                                  }}
                                  disabled={isSelf}
                                  title={isSelf ? "You cannot deactivate your own account" : undefined}
                                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                    m.isActive
                                      ? "border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                                      : "border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                  }`}
                                >
                                  {m.isActive ? "Deactivate" : "Reactivate"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pending Invitations Section */}
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      Pending Invitations ({invitations.filter((i) => i.status === "PENDING").length})
                    </span>
                  </div>
                </div>

                {invitations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                    No active or historical invitations for this workspace.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs">
                          <th className="py-3 px-4 font-medium">Invitee</th>
                          <th className="py-3 px-4 font-medium">Assigned Role</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium">Expires</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                        {invitations.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-zinc-900 dark:text-zinc-50">
                                {inv.name || inv.email}
                              </div>
                              <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                                {inv.email}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getRoleBadge(
                                  inv.role
                                )}`}
                              >
                                {inv.role}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              {inv.status === "PENDING" && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  Pending
                                </span>
                              )}
                              {inv.status === "ACCEPTED" && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Accepted
                                </span>
                              )}
                              {inv.status === "CANCELLED" && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                                  Cancelled
                                </span>
                              )}
                              {inv.status === "EXPIRED" && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-500 font-medium">
                                  Expired
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-xs text-zinc-500 dark:text-zinc-400">
                              {new Date(inv.expiresAt).toLocaleDateString()}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {inv.status === "PENDING" ? (
                                <div className="inline-flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => handleResendInvite(inv.id, inv.email)}
                                    className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white px-2.5 py-1 rounded-lg border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                  >
                                    Resend
                                  </button>
                                  <button
                                    onClick={() => handleCancelInvite(inv.id, inv.email)}
                                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: FEATURE FLAGS */}
          {activeTab === "flags" && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 border-b border-gray-150 dark:border-zinc-800 pb-4">
                <Shield className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Feature Flags</h2>
              </div>

              {flagsLoading ? (
                <div className="py-8 text-center text-xs text-zinc-400 animate-pulse">
                  Loading feature flags...
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {flags.map((flag) => (
                    <div
                      key={flag.key}
                      className="flex items-center justify-between py-5 gap-4"
                    >
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {flag.key}
                          </span>
                          {flag.enabled && (
                            <span className="text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          {flag.key === "dark_mode_enabled"
                            ? "Enables dark-mode adaptations for the client application layout."
                            : flag.key === "attachments_enabled"
                            ? "Enables pasting and viewing cloud attachment links on individual support tickets."
                            : "General tenant-wide configuration flag."}
                        </p>
                      </div>

                      <div>
                        <button
                          onClick={() => handleToggleFlag(flag.key, flag.enabled)}
                          disabled={updatingFlagKey === flag.key}
                          className="p-1 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                          title={`Toggle ${flag.key}`}
                        >
                          {flag.enabled ? (
                            <ToggleRight className="w-10 h-10 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audit Disclaimer */}
          <div className="bg-zinc-50 dark:bg-zinc-800/10 border border-gray-200 dark:border-zinc-800/40 rounded-2xl p-4 flex gap-3 text-xs text-zinc-500">
            <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
            <p>
              All organization governance actions (member invitations, role modifications, member deactivations, and feature flags) are append-only and cryptographically logged under the immutable audit trail.
            </p>
          </div>

        </div>
      </div>

      {/* MODAL 1: INVITE MEMBER */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  <UserPlus className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Invite Team Member</h3>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteSuccessLink ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Invitation Dispatched Successfully!
                  </div>
                  <p>
                    An email invitation has been dispatched to <strong>{inviteEmail}</strong>.
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    (In local development mode, you can also copy the direct single-use invite link below):
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={inviteSuccessLink}
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-2 font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(inviteSuccessLink)}
                      className="px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setInviteModalOpen(false);
                    setInviteEmail("");
                    setInviteName("");
                    setInviteSuccessLink(null);
                  }}
                  className="w-full bg-black dark:bg-white text-white dark:text-black font-medium rounded-xl p-2.5 text-xs sm:text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                {inviteError && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-3 text-xs">
                    {inviteError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Full Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Work Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. alex@acme.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Role & Permissions
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                    >
                      <option value="SUPPORT_AGENT">SUPPORT_AGENT — Customer Support</option>
                      <option value="REVIEWER_APPROVER">REVIEWER_APPROVER — Code Reviewer</option>
                      <option value="ORG_ADMIN">ORG_ADMIN — Administrator</option>
                    </select>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {inviteRole === "SUPPORT_AGENT"
                        ? "Can create, view, edit, and comment on support tickets. Cannot review PRs."
                        : inviteRole === "REVIEWER_APPROVER"
                        ? "Can review and approve engineering pull requests and inspect audit logs."
                        : "Full administrative governance over this organization."}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSubmitting}
                    className="px-4 py-2 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {inviteSubmitting ? "Dispatching..." : "Send Invitation"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: DEACTIVATE / REACTIVATE CONFIRMATION */}
      {deactivatingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  deactivatingMember.isActive
                    ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                    : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {deactivatingMember.isActive ? <UserX className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                  {deactivatingMember.isActive ? "Deactivate Team Member?" : "Reactivate Team Member?"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {deactivatingMember.name} ({deactivatingMember.email})
                </p>
              </div>
            </div>

            {actionError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-3 text-xs">
                {actionError}
              </div>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {deactivatingMember.isActive
                ? "Deactivating this member will immediately terminate all active sessions across all devices in Redis. They will be blocked from logging into this organization until reactivated."
                : "Reactivating this member will restore their access with their previous role."}
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivatingMember(null)}
                className="px-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleDeactivate}
                disabled={deactivateLoading}
                className={`px-4 py-2 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                  deactivatingMember.isActive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {deactivateLoading
                  ? "Updating..."
                  : deactivatingMember.isActive
                  ? "Yes, Deactivate Member"
                  : "Yes, Reactivate Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT ROLE */}
      {editingRoleMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                Change Role for {editingRoleMember.name}
              </h3>
              <button onClick={() => setEditingRoleMember(null)} className="text-zinc-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-3 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Select New Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-xs sm:text-sm"
              >
                <option value="SUPPORT_AGENT">SUPPORT_AGENT — Customer Support</option>
                <option value="REVIEWER_APPROVER">REVIEWER_APPROVER — Code Reviewer</option>
                <option value="ORG_ADMIN">ORG_ADMIN — Administrator</option>
              </select>
              <p className="text-xs text-zinc-500">
                Changing a member's role will trigger immediate session invalidation in Redis, prompting them to refresh permissions on their next request.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRoleMember(null)}
                className="px-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateRole}
                disabled={roleUpdateLoading}
                className="px-4 py-2 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
              >
                {roleUpdateLoading ? "Saving..." : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
