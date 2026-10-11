"use client";

import { Suspense } from "react";
import AcceptInvitationView from "@/frontend/views/AcceptInvitationView";

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
          <div className="text-zinc-500 text-sm animate-pulse">Loading invitation...</div>
        </div>
      }
    >
      <AcceptInvitationView />
    </Suspense>
  );
}
