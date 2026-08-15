/**
 * Support for the unauthenticated /public/* routes.
 *
 * **CORS here is browser convenience, not a security control (S6c).** The
 * origin allowlist below only constrains browsers, and `isAllowedPublicOrigin`
 * deliberately returns `true` when there is no `Origin` header, because
 * server-rendered sites and curl send none. Anyone who knows a school id can
 * `curl` these endpoints regardless of what this file says.
 *
 * The actual boundary is `publicSchoolFilter`: a school is served publicly only
 * while it is active and has registered a website. Do not add a check here and
 * assume it gates anything — put it in the query.
 *
 * Each school registers its own website URL (`School.websiteUrl`), so the
 * allowlist is DB-driven rather than a single global env var, and a new
 * school's site works without redeploying the backend.
 */
import type { RequestHandler } from "express";
import prisma from "../utils/prisma";

/**
 * S6a — the precondition for being served publicly at all. `websiteUrl != null`
 * makes "has a public site" explicit rather than implied, and `isActive` stops
 * a suspended or non-paying school's content from continuing to be served.
 */
export const publicSchoolFilter = { isActive: true, websiteUrl: { not: null } } as const;

/**
 * S6e — these responses are public and change rarely, and
 * `websiteRevalidate.service.ts` already provides a webhook to invalidate on
 * change. Caching them at the school's site and any CDN in front of it cuts
 * both database load and Railway egress on what is likely the highest-volume
 * unauthenticated traffic the app serves.
 */
export const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
  next();
};

const CACHE_TTL_MS = 60_000;

let cache: { origins: Set<string>; expiresAt: number } | null = null;

async function loadOrigins(): Promise<Set<string>> {
  const schools = await prisma.school.findMany({
    where: publicSchoolFilter,
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
