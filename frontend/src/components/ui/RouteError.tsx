"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

interface Props {
  /** The error Next.js caught. `digest` is set for errors thrown on the server. */
  error: Error & { digest?: string };
  /** Re-renders the segment. Retries the failed page without a full reload. */
  reset: () => void;
  /** Where "Back to..." points — the portal's landing page. */
  homeHref: string;
  homeLabel: string;
}

/**
 * Shared body for every route group's `error.tsx`.
 *
 * Without an error boundary a thrown exception unmounts the whole tree to a
 * blank white screen. Mounted per route group, this keeps the portal's own
 * layout (sidebar/header) on screen and confines the failure to the content area.
 */
export default function RouteError({ error, reset, homeHref, homeLabel }: Props) {
  useEffect(() => {
    // The only record this error ever leaves today. Wire an error tracker in here
    // when one is added — this is the single place every client-side crash passes through.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-4">
        <AlertTriangle size={26} className="text-accent" />
      </div>

      <h2 className="font-display font-bold text-xl text-primary">Something went wrong</h2>
      <p className="text-sm text-gray-600 mt-2 max-w-md">
        This page failed to load. Your data has not been changed — try again, and if it keeps
        happening, report the code below.
      </p>

      {error.digest && (
        <p className="mt-3 text-[11px] text-gray-400 font-mono">Error code: {error.digest}</p>
      )}

      <div className="flex items-center gap-3 mt-6">
        <button onClick={reset} className="btn-primary">
          <RotateCw size={16} />
          Try again
        </button>
        <Link href={homeHref} className="btn-outline">
          <Home size={16} />
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
