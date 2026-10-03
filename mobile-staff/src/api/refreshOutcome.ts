// Pure: decides what a failed /auth/refresh call means. No imports so it can be
// unit-tested with plain `node --test`.
//
// Only a definitive answer from the server (401/403: the refresh token is invalid,
// expired or the account is disabled) may sign the user out. Anything else — no
// connectivity, a timeout, a 5xx, a captive portal — says nothing about the token,
// so the stored login must be kept and the request retried later.
export type RefreshFailure = 'rejected' | 'unavailable';

export function classifyRefreshError(err: unknown): RefreshFailure {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403 ? 'rejected' : 'unavailable';
}

/** Network-level failure (never reached the server / no response). */
export function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; isRefreshUnavailable?: boolean } | null;
  return !!e && (e.isRefreshUnavailable === true || e.response == null);
}
