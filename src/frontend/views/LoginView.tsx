"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/");
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage("");
    setError("");
    setRecoveryLoading(true);

    try {
      const res = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail.trim().toLowerCase() }),
      });

      const data = await res.json();
      setRecoveryMessage(
        data.message ||
          "If an account with that email exists, password reset instructions have been sent."
      );
    } catch {
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
        {!forgotMode ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Login
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Enter your credentials to access your account
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                required
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setError("");
                  setRecoveryEmail(email);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-lg p-2.5 text-sm transition-colors cursor-pointer"
            >
              Sign In
            </button>

            <div className="pt-2 text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Need an organization workspace?{" "}
                <Link
                  href="/register"
                  className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                >
                  Create account
                </Link>
              </p>
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-zinc-800">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Demo Credentials:
              </p>
              <p className="text-xs font-mono mt-1 text-zinc-600 dark:text-zinc-300">
                admin@acme.com / password123
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Reset Password
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Enter your work email and we will send you a reset link
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            {recoveryMessage ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg p-3 text-sm leading-relaxed">
                  {recoveryMessage}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setRecoveryMessage("");
                  }}
                  className="w-full bg-black dark:bg-white text-white dark:text-black font-medium rounded-lg p-2.5 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="Work Email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full bg-black hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-medium rounded-lg p-2.5 text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {recoveryLoading ? "Sending Link..." : "Send Reset Link"}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setError("");
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
