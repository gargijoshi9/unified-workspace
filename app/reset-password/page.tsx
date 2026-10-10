"use client";

import { Suspense } from "react";
import ResetPasswordView from "@/frontend/views/ResetPasswordView";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
          <div className="text-zinc-500 text-sm animate-pulse">Loading reset page...</div>
        </div>
      }
    >
      <ResetPasswordView />
    </Suspense>
  );
}
