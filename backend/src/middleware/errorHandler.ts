import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import logger from "../utils/logger";

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  if (statusCode >= 500) {
    logger.error(
      { err, method: req.method, url: req.originalUrl, statusCode },
      `${err.name}: ${err.message}`
    );
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation Error",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // Custom app errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A record with this data already exists." });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Referenced record not found. A related entity may have been deleted." });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found." });
    }
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    logger.error({ err, method: req.method, url: req.originalUrl }, "Prisma unknown request error");
    return res.status(500).json({ error: "A database error occurred. Check that all migrations have been applied." });
  }

  // Fallback
  return res.status(500).json({
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
}