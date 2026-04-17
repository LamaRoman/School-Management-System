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

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
});

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);
