"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ArrowClockwise, Plugs } from "@phosphor-icons/react";

import { AppLogo } from "@/components/app-logo";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  StatusPill,
} from "@/components/pacific/primitives";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { connectionStatusLabel } from "@/lib/status";
import { POPULAR_TOOLKITS, toolkitDisplayName } from "@/lib/toolkit";
import { cn } from "@/lib/utils";

type Connection = {
  id: string;
  toolkit: string;
  status: string;
  isDisabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export default function IntegrationsPage() {
  const listConnections = useAction(api.composio.listConnections);
  const requestConnection = useAction(api.composio.requestConnection);
  const disconnectConnection = useAction(api.composio.disconnectConnection);

  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setConnections(await listConnections({}));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your connections",
      );
      setConnections([]);
    } finally {
      setRefreshing(false);
    }
  }, [listConnections]);

  // Load once on mount. A ref keeps this out of render state so the fetch
  // cannot cascade renders.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refresh();
  }, [refresh]);

  const connectedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const connection of connections ?? []) {
      if (connection.status === "ACTIVE" && !connection.isDisabled) {
        set.add(connection.toolkit);
      }
    }
    return set;
  }, [connections]);

  const available = useMemo(
    () => POPULAR_TOOLKITS.filter((item) => !connectedSlugs.has(item.toolkit)),
    [connectedSlugs],
  );

  async function connectToolkit(toolkit: string) {
    setBusyId(toolkit);
    setError(null);
    try {
      const link = await requestConnection({
        toolkit,
        callbackUrl: `${window.location.origin}/integrations`,
      });
      if (!link.redirectUrl) {
        throw new Error("This app did not return an authorization link");
      }
      window.location.assign(link.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start connect");
      setBusyId(null);
    }
  }

  async function disconnect(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await disconnectConnection({ connectedAccountId: id });
      setConnections((prev) => (prev ?? []).filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusyId(null);
    }
  }

  const loading = connections === null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        actions={
          <>
            <SidebarTrigger className="md:hidden" />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh connections"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pr-line)] px-3.5 py-2 text-[12.5px] text-[var(--pr-soft)] transition-colors hover:bg-[var(--pr-ink)]/[0.03] disabled:opacity-50"
            >
              <ArrowClockwise
                size={14}
                weight="bold"
                className={cn(refreshing && "animate-spin")}
              />
              Refresh
            </button>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-8 md:px-8">
        {error ? <ErrorNote message={error} /> : null}

        <section className="space-y-4">
          <div>
            <h2 className="pr-display text-[1.15rem] text-[var(--pr-ink)]">
              Connected
            </h2>
            <p className="mt-1 text-[13px] text-[var(--pr-muted)]">
              Apps Pacific can act in on your behalf.
            </p>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : connections.length === 0 ? (
            <EmptyState
              icon={<Plugs size={24} />}
              title="Nothing connected yet"
              description="Connect an app below, or let Pacific ask for exactly what it needs during a call."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connections.map((connection) => {
                const status = connectionStatusLabel(
                  connection.status,
                  connection.isDisabled,
                );
                const busy = busyId === connection.id;
                return (
                  <li
                    key={connection.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[var(--pr-line)] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--pr-line)]">
                          <AppLogo name={connection.toolkit} size={16} />
                        </span>
                        <p className="truncate text-[14.5px] text-[var(--pr-ink)]">
                          {toolkitDisplayName(connection.toolkit)}
                        </p>
                      </div>
                      <StatusPill label={status.label} tone={status.tone} />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void disconnect(connection.id)}
                      className="self-start rounded-full px-2.5 py-1 text-[12px] text-[var(--pr-muted)] transition-colors hover:bg-[var(--pr-ink)]/[0.04] hover:text-[var(--pr-ink)] disabled:opacity-50"
                    >
                      {busy ? "Disconnecting" : "Disconnect"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {available.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="pr-display text-[1.15rem] text-[var(--pr-ink)]">
                Add an app
              </h2>
              <p className="mt-1 text-[13px] text-[var(--pr-muted)]">
                Authorizing here means Pacific can use it the moment you ask.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((item) => {
                const busy = busyId === item.toolkit;
                return (
                  <li
                    key={item.toolkit}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--pr-line)] bg-white px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--pr-line)]">
                        <AppLogo name={item.toolkit} size={14} />
                      </span>
                      <p className="truncate text-[14px] text-[var(--pr-ink)]">
                        {item.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void connectToolkit(item.toolkit)}
                      className="shrink-0 rounded-full bg-[var(--pr-dark)] px-3.5 py-1.5 text-[12.5px] text-[var(--pr-cream)] transition-colors hover:bg-[var(--pr-dark-hover)] disabled:opacity-60"
                    >
                      {busy ? "Opening" : "Connect"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
