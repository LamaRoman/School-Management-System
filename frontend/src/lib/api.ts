const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  // Deduplicates concurrent refresh attempts: if 3 requests all get 401 at
  // the same time, only one /auth/refresh call is made.
  private refreshPromise: Promise<boolean> | null = null;

  // No-op stubs — token lives in HttpOnly cookies, invisible to JS.
  setToken(_token: string | null): void {}
  getToken(): string | null { return null; }

  private async tryRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  // For endpoints that return a non-JSON body (e.g. PDF blobs). Same 401
  // silent-refresh-and-retry behavior as `request`, but hands back the raw
  // Response instead of parsing JSON.
  async fetchRaw(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
    });

    if (
      res.status === 401 &&
      !isRetry &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/login")
    ) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.fetchRaw(path, options, true);
      }
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login";
      }
    }

    return res;
  }

  private async request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    // Only send Content-Type when there is actually a body to describe.
    // In production the API is on a separate subdomain, so every call is
    // cross-origin; that header turns an otherwise "simple" GET into one that
    // needs a CORS preflight, costing an extra OPTIONS round trip before the
    // request itself. `fetchRaw` has always omitted it for the same reason.
    const headers: Record<string, string> = {
      ...(options.body != null ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    // On 401, try a silent refresh once, then retry the original request.
    // Skip if this IS the retry (prevents infinite loops), or if this is the
    // refresh endpoint itself, or if this is a login attempt — a failed login
    // isn't an expired session, and refreshing here would mask the real
    // "invalid email or password" error behind a misleading "Session expired".
    if (
      res.status === 401 &&
      !isRetry &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/login")
    ) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
      // Refresh failed — session is dead.
      // Redirect to login ONLY if not already there (prevents redirect loop).
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login";
      }
      throw new Error("Session expired");
    }

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "Something went wrong");
    }
    return json.data;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
