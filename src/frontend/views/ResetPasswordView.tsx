"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";

export default function ResetPasswordView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing. Please request a new password reset link.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password. The link may have expired.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm text-center space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Invalid Reset Link</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This password reset link is invalid or missing a security token. Please request a new link from the login page.
          </p>
          <Link
            href="/login"
            className="inline-block w-full bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg p-2.5 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm text-center space-y-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Password Updated</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your password has been securely updated. All previous active sessions across all devices have been revoked.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg p-2.5 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Sign In with New Password
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <Lock className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Reset Password
            </h1>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Enter a new password for your organization workspace account.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-lg p-2.5 text-sm transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Updating Password..." : "Update Password"}
        </button>

        <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 text-center">
          <Link
            href="/login"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
