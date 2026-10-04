import prisma from "./prisma";

/**
 * What must happen after an admin sets someone's password, besides storing the hash.
 *
 * A staff member who "forgot" their password has usually already failed to sign in a few times,
 * and five failures lock the email for 15 minutes — so without clearing that, the fresh
 * password is refused until the lock runs out. And any session the old password opened (a lost
 * phone, a shared computer) must not survive the reset, so their refresh tokens go too.
 * Access tokens are short-lived and expire on their own.
 *
 * `LoginAttempt` is keyed by the lower-cased address the sign-in form sends, but older accounts
 * may be stored with capitals, so match case-insensitively.
 */
export async function afterAdminPasswordReset(userId: string, email: string): Promise<void> {
  await prisma.$transaction([
    prisma.loginAttempt.deleteMany({ where: { email: { equals: email, mode: "insensitive" } } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);
}
