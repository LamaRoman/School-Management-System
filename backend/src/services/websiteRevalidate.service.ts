/**
 * Website Revalidate Service
 *
 * Notifies the public school website that a piece of content changed, so it
 * can invalidate its cache and show the update within seconds instead of
 * waiting for a time-based revalidation window.
 *
 * Fire-and-forget: a slow or unreachable website must never break an admin
 * action (upload, delete, etc.), so failures are only logged.
 */

export async function revalidateWebsite(tag: string): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;

  if (!websiteUrl || !secret) {
    console.log("🌐 Website revalidation skipped — WEBSITE_URL or WEBSITE_REVALIDATE_SECRET not set");
    return;
  }

  try {
    const res = await fetch(`${websiteUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      console.warn(`Website revalidation for tag "${tag}" returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`Website revalidation for tag "${tag}" failed:`, err);
  }
}
