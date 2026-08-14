"use client";

/**
 * Shared body for every route group's `loading.tsx`.
 *
 * Next.js shows this while a route segment's code is still downloading, which on a
 * slow connection is otherwise a blank gap between the tap and the page appearing.
 * It renders inside the portal layout, so the sidebar/header stay put.
 */
export default function RouteLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-pulse text-primary font-display text-lg">Loading...</div>
    </div>
  );
}
