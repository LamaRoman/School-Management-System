/**
 * Strip the per-school website revalidation secret from any School object
 * before it is sent over the API. The secret is a webhook credential — it must
 * never leave the server. Callers receive a `hasWebsiteRevalidateSecret`
 * boolean instead, so the UI can still show whether one is configured without
 * ever transmitting its value.
 */
export function sanitizeSchool<
  T extends { websiteRevalidateSecret?: string | null }
>(school: T): Omit<T, "websiteRevalidateSecret"> & { hasWebsiteRevalidateSecret: boolean } {
  const { websiteRevalidateSecret, ...rest } = school;
  return { ...rest, hasWebsiteRevalidateSecret: !!websiteRevalidateSecret };
}
