import app from "./app";
import { closeBrowser } from "./services/pdf.service";
import { cleanupExpiredAuthRecords } from "./middleware/auth";
import logger from "./utils/logger";

// ─── Validate required env vars on startup ────────────────
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.fatal({ key }, "Missing required env var");
    process.exit(1);
  }
}

// Reject known-placeholder or too-short JWT secrets. A copy-pasted
// .env.example ("your-super-secret-jwt-key-change-in-production") or any short
// secret is trivially brute-forceable/forgeable, which would let anyone mint
// valid tokens for any user/role. Hard-fail in production; warn in dev.
const WEAK_JWT_SECRETS = new Set([
  "your-super-secret-jwt-key-change-in-production",
  "changeme",
  "secret",
  "jwt-secret",
]);
const jwtSecret = process.env.JWT_SECRET!;
if (WEAK_JWT_SECRETS.has(jwtSecret) || jwtSecret.length < 32) {
  const msg =
    "JWT_SECRET is a known placeholder or shorter than 32 characters — tokens would be trivially forgeable.";
  if (process.env.NODE_ENV === "production") {
    logger.fatal(msg + " Refusing to start.");
    process.exit(1);
  }
  logger.warn(msg + " Set a strong, random secret before deploying.");
}

const PORT = process.env.PORT || 4000;

// ─── Periodic cleanup ─────────────────────────────────────
// Purge expired token-blocklist entries (JWT already expired, revocation record
// is useless), stale login-attempt records (no activity for 1 hour), and
// expired refresh tokens.
// Runs every hour. Errors are logged but never crash the server.
setInterval(() => {
  cleanupExpiredAuthRecords().catch((err) =>
    logger.error({ err }, "Auth cleanup failed")
  );
}, 60 * 60 * 1000);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "API server running");
});

// ─── Graceful shutdown ────────────────────────────────────
// Runs on Ctrl+C, on Railway's deploy signal, and on each `node --watch`
// restart. Close the browser and HTTP server, then exit — otherwise the
// listener and hourly interval keep the process alive and the runtime has
// to force-kill it (slow dev restarts, ungraceful prod shutdowns).
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeBrowser().catch(() => {});
  server.close(() => process.exit(0));
  // Safety net: exit even if lingering keep-alive connections stall close().
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
