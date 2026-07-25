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

export async function revalidateWebsite(schoolId: string, tag: string): Promise<void> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { websiteUrl: true, websiteRevalidateSecret: true },
  });

  if (!school?.websiteUrl || !school.websiteRevalidateSecret) {
    console.log(`🌐 Website revalidation skipped for school ${schoolId} — no website linked`);
    return;
  }

  try {
    const res = await fetch(`${school.websiteUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": school.websiteRevalidateSecret,
      },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      console.warn(`Website revalidation for school ${schoolId}, tag "${tag}" returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`Website revalidation for school ${schoolId}, tag "${tag}" failed:`, err);
  }
}
