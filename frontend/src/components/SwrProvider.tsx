"use client";
import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { api } from "@/lib/api";

/**
 * Global SWR configuration. Every `useSWR(path)` in the app is keyed by the API
 * path and fetched through the shared `api` client, so it inherits the silent
 * 401-refresh-and-retry behaviour and the `{ data }` unwrapping.
 *
 * Keying by URL is what makes out-of-order responses harmless: a slow response
 * for section A can only ever be written into section A's cache entry, never
 * over section B's (the race described under F4 in PERFORMANCE_AUDIT.md).
 */
export function SwrProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: (path: string) => api.get(path),
        // Attendance, mark entry and observations are half-filled forms rendered
        // beside their roster. A refetch triggered by the operator tabbing away
        // and back would swap that roster out from under them mid-entry.
        revalidateOnFocus: false,
        // The api client already handles the only retryable failure (an expired
        // session) by refreshing and replaying the request. What is left is 403 /
        // 404 / validation, none of which fix themselves on a second attempt.
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
