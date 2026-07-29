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
  Sparkles
} from "lucide-react";

interface FeatureFlag {
  id?: string;
  key: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingFlagKey, setUpdatingFlagKey] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchFlags();
    }
  }, [status, router]);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feature-flags");
      const data = await res.json();
      if (res.ok) {
        // Ensure default flags exist in display list even if not yet saved in DB
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
      console.error(err);
    } finally {
      setLoading(false);
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
        // Update local state
        setFlags((prev) =>
          prev.map((f) => (f.key === key ? { ...f, enabled: !currentEnabled } : f))
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update feature flag");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating feature flag");
    } finally {
      setUpdatingFlagKey(null);
    }
  };

  if (status === "loading" || loading) {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 p-6 sm:p-10 transition-colors duration-300">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-zinc-800 pb-6">
          <div className="space-y-1">
            <Link
              href="/support"
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Support Hub
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage configuration and feature flags for <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeMembership?.orgName}</span>
            </p>
          </div>
        </div>

        {/* Settings Body */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm p-6 sm:p-8 space-y-6">
          
          <div className="flex items-center gap-2 border-b border-gray-150 dark:border-zinc-800 pb-4">
            <Shield className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Feature Flags</h2>
          </div>

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

        </div>

        {/* Audit Disclaimer */}
        <div className="bg-zinc-50 dark:bg-zinc-800/10 border border-gray-200 dark:border-zinc-800/40 rounded-2xl p-4 flex gap-3 text-xs text-zinc-500">
          <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
          <p>
            Any modification to organization feature flags is considered a high-risk security operation and is logged immediately under the active organization audit trail.
          </p>
        </div>

      </div>
    </div>
  );
}
