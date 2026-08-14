"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * "Latest wins" guard for a stream of data fetches.
 *
 * Every data-fetching effect and handler in this app is exposed to the same race:
 * select section A, quickly select B, and A's slower response can resolve *after*
 * B's and overwrite state. The UI then shows B selected while displaying A's data —
 * and on the pages that also write (attendance, observations, roll numbers, fee
 * collection) the operator can save against a roster or ledger that is not the one
 * they think they are looking at.
 *
 * Each call issues a ticket. When the fetch resolves, `apply` runs only if no later
 * call has been issued in the meantime, and only if the component is still mounted.
 * A refetch of the *same* key still applies — it is the latest request, which is what
 * makes this safe to use for the "reload after save" pattern.
 *
 * Call this **once per independent stream of requests**, not once per page: the ticket
 * counter is shared across every call from one instance, so pointing it at two unrelated
 * fetches (grades and students, say) would make one silently cancel the other.
 *
 *     const runStudents = useLatestRequest();
 *     runStudents(
 *       () => api.get<Student[]>(`/students?sectionId=${id}`),
 *       setStudents,
 *       () => setStudents([]),
 *     );
 *
 * This is the stopgap the audit calls for under **F4a**. It fixes which `setState`
 * wins; it does not abort the in-flight request, so the response is still downloaded.
 * Adopting SWR/React Query (**F4b**, **F5**) makes the guard unnecessary, since a
 * URL-keyed cache cannot cross-contaminate by construction.
 */
export function useLatestRequest() {
  const ticket = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    // Reassigned on mount, not just cleaned up on unmount — React's dev-mode double
    // invoke would otherwise leave this permanently false after the first cleanup.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(
    async <T,>(
      fetcher: () => Promise<T>,
      apply: (data: T) => void,
      onError?: (err: unknown) => void
    ): Promise<void> => {
      const mine = ++ticket.current;
      const isLatest = () => mine === ticket.current && mounted.current;
      try {
        const data = await fetcher();
        if (isLatest()) apply(data);
      } catch (err) {
        if (isLatest()) {
          if (onError) onError(err);
          else console.error(err);
        }
      }
    },
    []
  );
}
