/**
 * Tracks which origins are allowed to call the unauthenticated /public/*
 * routes. Each school registers its own website's URL (School.websiteUrl),
 * so this is a DB-driven allowlist instead of a single global env var —
 * every school's site gets its own origin without redeploying the backend.
 *
 * Cached briefly since this is checked on every /public/* request.
 */
import prisma from "../utils/prisma";

const CACHE_TTL_MS = 60_000;

let cache: { origins: Set<string>; expiresAt: number } | null = null;

async function loadOrigins(): Promise<Set<string>> {
  const schools = await prisma.school.findMany({
    where: { isActive: true, websiteUrl: { not: null } },
    select: { websiteUrl: true },
  });

  const origins = new Set<string>();
  for (const school of schools) {
    if (!school.websiteUrl) continue;
    try {
      origins.add(new URL(school.websiteUrl).origin);
    } catch {
      // malformed URL saved for some school — skip it rather than fail every request
    }
  }
  return origins;
}

export async function isAllowedPublicOrigin(requestOrigin: string | undefined): Promise<boolean> {
  if (!requestOrigin) return true; // non-browser callers (curl, server-to-server) send no Origin header

  if (!cache || cache.expiresAt <= Date.now()) {
    cache = { origins: await loadOrigins(), expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cache.origins.has(requestOrigin);
}

/**
 * Drop the cached allowlist so the next /public/* request re-reads it from
 * the DB. Call this after creating/updating a School's websiteUrl so a
 * newly-registered site doesn't have to wait out the TTL to be allowed.
 */
export function invalidatePublicOriginsCache(): void {
  cache = null;
}
