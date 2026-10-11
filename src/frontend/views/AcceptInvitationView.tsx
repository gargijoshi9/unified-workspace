"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Users, Lock, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";

export default function AcceptInvitationView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [tokenError, setTokenError] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError("Missing invitation token. Please check your invitation email.");
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/organization/members/invite/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok || !data.valid) {
          setTokenError(data.error || "This invitation link is invalid or has expired.");
        } else {
          setInvitationData(data.invitation);
          setName(data.invitation.name || "");
        }
      } catch {
        setTokenError("Failed to verify invitation. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setSubmitError("Password must contain at least one letter and one number.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/organization/members/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Failed to accept invitation.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);

      // Auto sign-in
      const signInRes = await signIn("credentials", {
        email: invitationData.email,
        password,
        redirect: false,
      });

      if (!signInRes?.error) {
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-zinc-500 text-sm animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-ping"></div>
          Verifying your invitation...
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm text-center space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Invalid Invitation</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{tokenError}</p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block w-full bg-black dark:bg-white text-white dark:text-black font-medium rounded-xl p-2.5 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm text-center space-y-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Invitation Accepted!</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Welcome to <span className="font-semibold text-zinc-700 dark:text-zinc-300">{invitationData.orgName}</span>. Redirecting you to your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
            <Users className="w-3.5 h-3.5" />
            {invitationData.orgName}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Join the Workspace
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            You've been invited to join as{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{invitationData.role}</span>.
            Set up your credentials below to access your team dashboard.
          </p>
        </div>

        {submitError && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl p-3 text-xs">
            {submitError}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={invitationData.email}
              disabled
              className="w-full border border-gray-200 dark:border-zinc-800 bg-gray-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-xl p-2.5 text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Alex Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Create Password (min. 8 chars, letters & numbers)
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-xl p-2.5 text-sm transition-colors cursor-pointer disabled:opacity-50"
        >
          {submitting ? "Joining Organization..." : "Accept Invitation & Join Team"}
          {!submitting && <ArrowRight className="w-4 h-4" />}
        </button>

        <div className="pt-2 text-center border-t border-gray-100 dark:border-zinc-800">
          <Link
            href="/login"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Already have an account? Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
