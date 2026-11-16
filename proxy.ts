import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk only attaches the auth context here. Authorization itself lives with
 * the resource it protects: `app/(app)/layout.tsx` for the workspace, and
 * every Convex function derives identity server-side.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
