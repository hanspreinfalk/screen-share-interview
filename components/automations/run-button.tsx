"use client";

import { useState } from "react";
import { useMutation } from "convex/react";

import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { automationsApi } from "@/lib/automations-api";
import { cn } from "@/lib/utils";

/**
 * Starts a real execution. `test` tags the run so the history can label it
 * honestly: a test is still a real run with real side effects.
 */
export function RunButton({
  automationId,
  label = "Run",
  className,
  variant = "default",
  size = "sm",
  disabled,
  test = false,
  onStarted,
}: {
  automationId: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  disabled?: boolean;
  test?: boolean;
  onStarted?: (executionId: string) => void;
}) {
  const run = useMutation(automationsApi.run);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        className={cn(
          variant === "default" &&
            "!bg-[var(--pr-dark)] !text-[var(--pr-cream)] hover:!bg-[var(--pr-dark-hover)]",
          className,
        )}
        onClick={() => {
          setError(null);
          setPending(true);
          void run({ id: automationId as Id<"automations">, test })
            .then((executionId) => {
              onStarted?.(executionId);
            })
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Could not start a run",
              );
            })
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Starting" : label}
      </Button>
      {error ? (
        <p className="text-right text-[11px] text-[var(--pr-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
