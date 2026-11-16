"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

/** Keeps the Convex `users` row in sync whenever Clerk auth is ready. */
export function StoreUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const storedForSession = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || storedForSession.current) {
      return;
    }
    storedForSession.current = true;
    void storeUser().catch(() => {
      storedForSession.current = false;
    });
  }, [isAuthenticated, isLoading, storeUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      storedForSession.current = false;
    }
  }, [isAuthenticated]);

  return null;
}
