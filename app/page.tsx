"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 text-sm animate-pulse">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 p-6">
        <div className="w-full max-w-md text-center space-y-6 p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Unified Workspace</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              Please sign in to access your organization dashboard.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full justify-center bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-lg p-2.5 text-sm transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const user = session.user as any;
  const activeOrg = user.memberships?.find((m: any) => m.orgId === user.activeOrgId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex justify-between items-start border-b border-gray-100 dark:border-zinc-800 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Identity Verification</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs">Confirming Session and Org Memberships</p>
          </div>
          <button
            onClick={() => signOut()}
            className="px-3 py-1.5 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg text-xs transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-gray-50 dark:border-zinc-800/50">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Logged In As</span>
            <span className="col-span-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{user.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-gray-50 dark:border-zinc-800/50">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Email</span>
            <span className="col-span-2 text-sm font-mono text-zinc-600 dark:text-zinc-300">{user.email}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-gray-50 dark:border-zinc-800/50">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Active Org</span>
            <span className="col-span-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {activeOrg ? `${activeOrg.orgName}` : "None"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2.5">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Active Role</span>
            <span className="col-span-2 text-sm font-mono text-zinc-600 dark:text-zinc-300">
              {activeOrg ? activeOrg.role : "N/A"}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">All Memberships</h2>
          <div className="space-y-2">
            {user.memberships?.map((m: any) => (
              <div key={m.orgId} className="flex justify-between items-center bg-gray-50 dark:bg-zinc-800/30 border border-gray-100 dark:border-zinc-800/50 rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{m.orgName}</span>
                <span className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
