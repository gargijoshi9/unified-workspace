"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Users, ShieldAlert, ArrowRightLeft, LogOut, ArrowRight, Settings } from "lucide-react";

export default function Home() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const isRevoked = session && (session as any).error === "RevokedSession";

  useEffect(() => {
    if (status === "unauthenticated" || isRevoked) {
      if (isRevoked) {
        signOut({ callbackUrl: "/login" });
      } else {
        router.push("/login");
      }
    }
  }, [status, isRevoked, router]);

  if (status === "loading" || !session || isRevoked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Loading session...
        </div>
      </div>
    );
  }

  const memberships = (session.user as any)?.memberships || [];
  const activeOrgId = (session.user as any)?.activeOrgId;
  const activeMembership = memberships.find((m: any) => m.orgId === activeOrgId);

  const handleSwitchOrg = async (orgId: string) => {
    setSwitching(true);
    await update({ activeOrgId: orgId }); // triggers jwt callback with trigger === "update"
    setSwitching(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8 space-y-6 relative overflow-hidden">
        {/* Decorative backdrop elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-zinc-100 dark:bg-zinc-800/30 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-zinc-100 dark:bg-zinc-800/30 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-100 dark:border-zinc-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-zinc-900 dark:bg-zinc-100 rounded-lg text-white dark:text-black">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Unified Org Workspace</h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs">Verify identities and cross-org workspaces seamlessly</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg text-xs transition-all cursor-pointer shadow-sm hover:shadow active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        {/* Identity Details Card */}
        <div className="bg-zinc-50 dark:bg-zinc-800/30 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 space-y-3.5">
          <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-zinc-800/50">
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Logged in as</span>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{session.user?.name} ({session.user?.email})</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-zinc-800/50">
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Active Org</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{activeMembership?.orgName || "None"}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Role</span>
            <span className="text-xs font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded">
              {activeMembership?.role || "N/A"}
            </span>
          </div>
        </div>

        {/* Organization Switcher */}
        {memberships.length > 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <ArrowRightLeft className="w-4 h-4 text-zinc-400" />
              <p className="font-semibold text-sm">Switch Org:</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {memberships.map((m: any) => {
                const isActive = m.orgId === activeOrgId;
                return (
                  <button
                    key={m.orgId}
                    disabled={switching || isActive}
                    onClick={() => handleSwitchOrg(m.orgId)}
                    className={`flex items-center justify-between px-4 py-3 border rounded-xl transition-all text-sm font-medium ${
                      isActive
                        ? "bg-zinc-900 text-white border-zinc-950 dark:bg-white dark:text-black dark:border-white shadow-md cursor-default opacity-90"
                        : "border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 active:scale-[0.98] cursor-pointer"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                  >
                    <span>{m.orgName}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive 
                        ? "bg-zinc-800 dark:bg-zinc-100 text-zinc-300 dark:text-zinc-600" 
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    }`}>
                      {m.role}
                    </span>
                  </button>
                );
              })}
            </div>
            {switching && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 animate-pulse text-center">Switching organizations...</p>
            )}
          </div>
        )}

        {/* Hub / Navigation Links */}
        <div className="pt-5 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-4">
          <Link
            href="/support"
            className="flex-1 flex items-center justify-between px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-95 group"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Support Hub</span>
            </div>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/review"
            className="flex-1 flex items-center justify-between px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl text-sm transition-all shadow-md shadow-purple-500/10 hover:shadow-purple-500/20 active:scale-95 group"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              <span>Review & Audit Console</span>
            </div>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Audit Log link for Admins and Reviewers */}
        {(activeMembership?.role === "ORG_ADMIN" || activeMembership?.role === "REVIEWER_APPROVER" || activeMembership?.role === "PLATFORM_SUPER_ADMIN") && (
          <div className="pt-4 flex justify-center">
            <Link
              href="/review/audit"
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 font-semibold"
            >
              <Settings className="w-3.5 h-3.5" />
              Go to Security & Audit Console
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
