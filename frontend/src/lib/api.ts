const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  // Token is now stored in an HttpOnly cookie — JavaScript cannot (and should
  // not) read it. The browser sends it automatically on every request via
  // credentials: "include". These no-op stubs exist only so call-sites that
  // haven't been cleaned up yet don't crash at runtime.
  setToken(_token: string | null): void {
    // no-op — cookie is set by the server's Set-Cookie header
  }

  getToken(): string | null {
    // HttpOnly cookies are invisible to JS by design.
    return null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    const json = await res.json();

    if (res.status === 401) {
      // Session expired or token revoked — redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error(json.error || "Unauthorized");
    }

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
