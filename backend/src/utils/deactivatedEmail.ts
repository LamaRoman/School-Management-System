/**
 * Deactivating a teacher or student frees up their login address by prefixing
 * `users.email` with a per-user marker — the column is globally unique, so a
 * live row would otherwise block that address from ever being reused.
 *
 * Both helpers are idempotent, which is the point of them existing. An earlier
 * version prefixed unconditionally on every deactivation, so deactivating an
 * already-deactivated account stacked a second marker
 * (`deleted_<id>_deleted_<id>_a@b.com`). Reactivation stripped only one, which
 * left the account "Active" in the admin UI but holding an address nobody could
 * ever log in with. `unmangleEmail` strips every marker present, so reactivating
 * also repairs any row already stacked by that bug.
 */

function marker(userId: string): string {
  return `deleted_${userId}_`;
}

/** Prefix the address so it stops occupying the unique email slot. No-op if already prefixed. */
export function mangleEmail(userId: string, email: string): string {
  const prefix = marker(userId);
  return email.startsWith(prefix) ? email : `${prefix}${email}`;
}

/** Recover the original address, stripping every marker present. No-op if unprefixed. */
export function unmangleEmail(userId: string, email: string): string {
  const prefix = marker(userId);
  let result = email;
  while (result.startsWith(prefix)) result = result.slice(prefix.length);
  return result;
}
