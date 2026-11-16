import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Resource-based auth gate for the whole workspace.
 *
 * Clerk deprecated middleware path matching because route patterns can diverge
 * from how Next.js resolves requests, leaving protected pages reachable.
 * Guarding the layout covers every route beneath it by construction.
 *
 * It lives in its own Suspense boundary so the runtime auth read does not
 * block prerendering of the static shell (sidebar and chrome).
 */
async function AuthGate() {
  await auth.protect();
  return null;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pacific-surface min-h-svh bg-white text-[var(--pr-ink)]">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <SidebarProvider>
        <Suspense fallback={null}>
          <AppSidebar />
        </Suspense>
        <SidebarInset className="min-h-svh bg-white">{children}</SidebarInset>
      </SidebarProvider>
    </div>
  );
}
