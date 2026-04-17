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

  private async request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    // On 401, try a silent refresh once, then retry the original request.
    // Skip if this IS the retry (prevents infinite loops) or if this is
    // the refresh endpoint itself.
    if (res.status === 401 && !isRetry && !path.startsWith("/auth/refresh")) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
      // Refresh failed — session is dead
      if (typeof window !== "undefined") {
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
