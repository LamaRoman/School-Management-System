"use client";

import { Clock } from "lucide-react";

/**
 * What a parent or student sees before results are published (W1e).
 *
 * The state this replaces was worse than an error: a live percentage, GPA and
 * rank computed from however many marks happened to be entered that morning,
 * looking exactly like a finished result. So this has to read as a normal,
 * expected state of the world — "not out yet" — rather than as a failure, and
 * it must not show a number of any kind.
 */
export default function ResultsPending({
  examName,
  pendingTerms,
  message,
}: {
  examName?: string;
  pendingTerms?: string[];
  message?: string;
}) {
  return (
    <div className="card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
        <Clock size={22} />
      </div>
      <h3 className="font-display font-bold text-primary text-base mb-1">
        {examName ? `${examName} — results not published yet` : "Results not published yet"}
      </h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        {message ?? "Your school will publish these results once marks entry is complete."}
      </p>
      {pendingTerms && pendingTerms.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          Waiting on: {pendingTerms.join(", ")}
        </p>
      )}
    </div>
  );
}
