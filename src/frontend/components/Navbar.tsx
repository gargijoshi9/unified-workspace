"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Bell, 
  Check, 
  RefreshCw, 
  GitPullRequest, 
  FileText, 
  Settings, 
  LogOut, 
  Building,
  User,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  Clock
} from "lucide-react";

interface Notification {
  id: string;
  content: string;
  createdAt: string;
  read: boolean;
}

export default function Navbar() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotifications();
      // Poll every 30 seconds for new notifications
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: "ALL" }),
      });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingRead(false);
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      if (res.ok) {
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerDigest = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/notifications/trigger", {
        method: "POST",
      });
      if (res.ok) {
        await fetchNotifications(); // Reload digests
      } else {
        alert("Failed to generate digest. Verify permissions.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  if (status !== "authenticated" || !session) return null;

  const user = session.user as any;
  const activeOrgId = user.activeOrgId;
  const memberships = user.memberships || [];
  const activeMembership = memberships.find((m: any) => m.orgId === activeOrgId);
  const userRole = activeMembership?.role || "N/A";

  const isViewAuditAllowed = userRole === "ORG_ADMIN" || userRole === "REVIEWER_APPROVER" || userRole === "PLATFORM_SUPER_ADMIN";

  return (
    <nav className="sticky top-0 z-40 w-full bg-[#0F1115]/90 backdrop-blur-md border-b border-[rgba(207,208,205,0.15)] transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Left Side: Brand Logo & Links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-sm select-none">
            <div className="p-1 bg-zinc-900 dark:bg-zinc-100 rounded-lg text-white dark:text-black">
              <LayoutDashboard className="w-4 h-4" />
            </div>
            <span>Unified Workspace</span>
          </Link>

          <div className="hidden md:flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <Link 
              href="/support" 
              className={`hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors ${
                pathname.startsWith("/support") ? "text-zinc-900 dark:text-zinc-100 font-bold" : ""
              }`}
            >
              Support Hub
            </Link>
            <Link 
              href="/review" 
              className={`hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors ${
                pathname.startsWith("/review") && !pathname.includes("/audit") ? "text-zinc-900 dark:text-zinc-100 font-bold" : ""
              }`}
            >
              Review Console
            </Link>
            {isViewAuditAllowed && (
              <Link 
                href="/review/audit" 
                className={`hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors ${
                  pathname.includes("/audit") ? "text-zinc-900 dark:text-zinc-100 font-bold" : ""
                }`}
              >
                Security & Audit
              </Link>
            )}
          </div>
        </div>

        {/* Right Side: Active Org, Notifications, User Menu */}
        <div className="flex items-center gap-4">
          
          {/* Active Org Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/50 dark:border-zinc-800 rounded-xl text-xs">
            <Building className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeMembership?.orgName || "No Org"}</span>
            <span className="text-[10px] font-mono bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1 rounded ml-1 leading-normal">
              {userRole}
            </span>
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="relative p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-rose-500 text-white font-bold text-[8px] flex items-center justify-center border border-white dark:border-zinc-900 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="font-bold text-xs">AI Progress Digests</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      disabled={markingRead}
                      className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {markingRead ? "marking..." : "Mark all read"}
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-gray-150 dark:divide-zinc-800/60">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-8">No notifications generated yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          if (!n.read) handleMarkSingleRead(n.id);
                        }}
                        className={`p-3.5 hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 text-xs transition-colors flex gap-2.5 cursor-pointer relative ${
                          !n.read ? "bg-blue-50/15 dark:bg-blue-950/5" : ""
                        }`}
                      >
                        {/* Unread indicator dot */}
                        {!n.read && (
                          <span className="absolute top-4 left-2 w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
                        )}
                        <div className={`space-y-1.5 ${!n.read ? "pl-2" : ""}`}>
                          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                            {n.content}
                          </p>
                          <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(n.createdAt).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-gray-200 dark:border-zinc-800 flex justify-center">
                  <button
                    onClick={handleTriggerDigest}
                    disabled={triggering}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black rounded-xl text-[10px] font-semibold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${triggering ? "animate-spin" : ""}`} />
                    {triggering ? "Generating Digest..." : "Generate Digest Now"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Signout Link */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>

        </div>
      </div>
    </nav>
  );
}
