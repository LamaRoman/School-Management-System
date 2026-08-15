import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Append connection pool size if not already set in DATABASE_URL
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  if (url.includes("connection_limit")) return url;
  const separator = url.includes("?") ? "&" : "?";
  // Small single-school deployment on a memory-billed host (Railway) — each
  // open Postgres connection costs RAM on the DB side around the clock, and
  // a handful of concurrent teachers/admins never needs 20 of them.
  return `${url}${separator}connection_limit=5&pool_timeout=30`;
}

// Under test, queries are emitted as events rather than printed. Nothing
// subscribes by default, so the suite stays quiet — but a test can count the
// queries a route issues, which is how the N+1s on the hot paths (bulk report
// cards, attendance totals) stay fixed instead of creeping back in.
function getLogConfig(): Prisma.LogDefinition[] {
  if (process.env.NODE_ENV === "development") {
    return [
      { emit: "stdout", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ];
  }
  if (process.env.NODE_ENV === "test") {
    return [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
    ];
  }
  return [{ emit: "stdout", level: "error" }];
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: getLogConfig(),
    datasources: {
      db: { url: getDatabaseUrl() },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;