import app from "./app";
import { closeBrowser } from "./services/pdf.service";
import { cleanupExpiredAuthRecords } from "./middleware/auth";

// ─── Validate required env vars on startup ────────────────
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 4000;

// ─── Periodic cleanup ─────────────────────────────────────
// Purge expired token-blocklist entries (JWT already expired, revocation record
// is useless), stale login-attempt records (no activity for 1 hour), and
// expired refresh tokens.
// Runs every hour. Errors are logged but never crash the server.
setInterval(() => {
  cleanupExpiredAuthRecords().catch((err) =>
    console.error("Auth cleanup failed:", err)
  );
}, 60 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
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
