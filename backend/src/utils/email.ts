import { z } from "zod";

/**
 * Account emails are stored in lower case, always. Phones and people type capitals ("Sita@Gmail.com")
 * and the login compares emails exactly, so an address stored with a capital could never be
 * matched by an app that lower-cases what is typed. Normalising here — trim, then lower case,
 * then validate — keeps every account, however it was created, signing in the same way.
 */
export const emailField = (message = "Invalid email") => z.string().trim().toLowerCase().email(message).max(320);
