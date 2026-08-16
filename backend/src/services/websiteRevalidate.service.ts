/**
 * Website Revalidate Service
 *
 * Notifies a school's public website that a piece of content changed, so it
 * can invalidate its cache and show the update within seconds instead of
 * waiting for a time-based revalidation window.
 *
 * Each school registers its own website URL + secret (School.websiteUrl /
 * websiteRevalidateSecret), so this looks the school up rather than reading
 * a single global env var — every school's site gets notified independently.
 *
 * Fire-and-forget: a slow or unreachable website must never break an admin
 * action (upload, delete, etc.), so failures are only logged.
 */
import prisma from "../utils/prisma";
import logger from "../utils/logger";

export async function revalidateWebsite(schoolId: string, tag: string): Promise<void> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { websiteUrl: true, websiteRevalidateSecret: true },
  });

  if (!school?.websiteUrl || !school.websiteRevalidateSecret) {
    logger.debug({ schoolId }, "Website revalidation skipped — no website linked");
    return;
  }

  // Use only the origin (protocol + host), not whatever path a super-admin
  // typed into websiteUrl (e.g. a trailing "/en" locale segment). The
  // revalidate route always lives at "<origin>/api/revalidate" — appending
  // to a URL that already has a path silently 404s the webhook instead of
  // reaching the route, since Next.js doesn't do prefix-matching here.
  let origin: string;
  try {
    origin = new URL(school.websiteUrl).origin;
  } catch {
    logger.warn({ schoolId }, "Website revalidation skipped — malformed websiteUrl");
    return;
  }

  try {
    const res = await fetch(`${origin}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": school.websiteRevalidateSecret,
      },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      logger.warn({ schoolId, tag, status: res.status }, "Website revalidation returned non-OK");
    }
  } catch (err) {
    logger.warn({ err, schoolId, tag }, "Website revalidation failed");
  }
}
