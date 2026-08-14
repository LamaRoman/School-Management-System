"use client";
import RouteError from "@/components/ui/RouteError";

/**
 * Root boundary. A segment's own `error.tsx` cannot catch an error thrown by its
 * *layout* — every portal layout calls `useAuth()`, so those failures land here,
 * as do errors on `/` and `/login`. Rendered without any portal chrome.
 */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <RouteError {...props} homeHref="/" homeLabel="Back to Home" />
    </div>
  );
}
