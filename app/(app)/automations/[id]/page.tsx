import { Suspense } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/pacific/primitives";
import { AutomationDetail } from "./automation-detail";

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-6 py-10">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

/** Awaits the route param inside the boundary so the shell still prerenders. */
async function Resolved({
  params,
}: {
  params: PageProps<"/automations/[id]">["params"];
}) {
  const { id } = await params;
  return <AutomationDetail id={id as Id<"automations">} />;
}

/**
 * The id is resolved on the server and passed down, so the client component
 * never reads a request-time hook.
 */
export default function AutomationDetailPage({
  params,
}: PageProps<"/automations/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Resolved params={params} />
    </Suspense>
  );
}
