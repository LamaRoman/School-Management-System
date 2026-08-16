// Must run before any other local import — route modules transitively
// import utils/prisma.ts, which reads process.env.DATABASE_URL at import
// time (not lazily), so .env has to be loaded before that happens.
import dotenv from "dotenv";
dotenv.config();

import "express-async-errors";
import express from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import prisma from "./utils/prisma";
import { errorHandler } from "./middleware/errorHandler";
import requestLogger from "./middleware/requestLogger";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pdfRoutes from "./routes/pdf.routes";

// Routes
import accountantReportRoutes from "./routes/accountantReport.routes";
import parentRoutes from "./routes/parent.routes";
import admissionRoutes from "./routes/admission.routes";
import noticeRoutes from "./routes/notice.routes";
import seatingRoutes from "./routes/seating.routes";
import promotionRoutes from "./routes/promotion.routes";
import reportCardSettingsRoutes from "./routes/reportCardSettings.routes";
import gradeSheetRoutes from "./routes/gradeSheet.routes";
import dailyAttendanceRoutes from "./routes/dailyAttendance.routes";
import teacherAssignmentRoutes from "./routes/teacherAssignment.routes";
import authRoutes from "./routes/auth.routes";
import schoolRoutes from "./routes/school.routes";
import academicYearRoutes from "./routes/academicYear.routes";
import gradeRoutes from "./routes/grade.routes";
import sectionRoutes from "./routes/section.routes";
import subjectRoutes from "./routes/subject.routes";
import examTypeRoutes from "./routes/examType.routes";
import gradingPolicyRoutes from "./routes/gradingPolicy.routes";
import studentRoutes from "./routes/student.routes";
import markRoutes from "./routes/mark.routes";
import reportRoutes from "./routes/report.routes";
import teacherRoutes from "./routes/teacher.routes";
import analyticsRoutes from "./routes/analytics.routes";
import examRoutineRoutes from "./routes/examRoutine.routes";
import resultStatusRoutes from "./routes/resultStatus.routes";
import observationRoutes from "./routes/observation.routes";
import feeRoutes from "./routes/fee.routes";
import homeworkRoutes from "./routes/homework.routes";
import staffRoutes from "./routes/staff.routes";
import superAdminRoutes from "./routes/superAdmin.routes";
import calendarRoutes from "./routes/calendar.routes";
import masterCalendarRoutes from "./routes/masterCalendar.routes";
import galleryRoutes from "./routes/gallery.routes";
import publicGalleryRoutes from "./routes/publicGallery.routes";
import publicCalendarRoutes from "./routes/publicCalendar.routes";
import { isAllowedPublicOrigin } from "./services/publicOrigins.service";

const app = express();
app.set("trust proxy", 1);

// gzip/brotli every compressible response. The big JSON payloads here —
// rosters, grade sheets, fee overviews — are highly repetitive and compress
// to roughly a fifth of their size, which cuts both load time on a slow
// mobile connection and Railway egress cost. Responses under 1KB are skipped
// by the default threshold, and already-compressed types (PDFs, images) are
// skipped by the default filter, so the report card path is unaffected.
app.use(compression());

// ─── Security middleware ──────────────────────────────────
app.use(helmet());
// maxAge lets the browser cache the CORS preflight instead of re-asking before
// every request. In production the frontend and API are on different
// subdomains, so without this each call that needs a preflight pays an extra
// round trip. Browsers clamp this to their own ceiling (Chrome 2h, Firefox 24h).
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  maxAge: 86400,
}));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "test") {
  app.use(requestLogger);
}

// Public, read-only routes (e.g. a school's website fetching its gallery) are
// called from an origin outside the SMS frontend, so they get their own
// narrower, per-school CORS allowlist (each school's own registered
// websiteUrl) instead of loosening the app-wide origin above.
app.use(
  "/public",
  cors({
    origin: async (requestOrigin, callback) => {
      try {
        callback(null, await isAllowedPublicOrigin(requestOrigin));
      } catch (err) {
        callback(err as Error);
      }
    },
    credentials: false,
  })
);

// ─── Rate limiting (disabled in test environment) ────────
if (process.env.NODE_ENV !== "test") {
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // change-password triggers bcrypt.compare (on currentPassword) and bcrypt.hash
  // (on newPassword) — both CPU-bound. Apply a strict limiter so an authenticated
  // attacker can't repeatedly call it to burn CPU.
  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "Too many password change attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    // Mounting publicLimiter on /public is not enough on its own: this one is
    // mounted on "/" and would still run afterwards, re-imposing the 500 cap it
    // is meant to be exempt from.
    skip: (req) => req.path.startsWith("/public/") || req.path === "/public",
  });

  // S6d — /public/* needs its own budget. The general limiter is 500 requests
  // per 15 minutes *per IP*, and a school's server-rendered website makes every
  // one of its visitors' requests arrive from a single server IP. Under quite
  // modest traffic the site would rate-limit itself, presenting as an
  // intermittently broken gallery that looks like a bug in the website.
  //
  // Still limited, just far higher, and these responses are cacheable
  // (see publicCache) so a well-behaved site should rarely come near it.
  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5_000,
    message: { error: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/auth/login", loginLimiter);
  app.use("/auth/change-password", passwordLimiter);
  app.use("/public", publicLimiter);
  app.use("/", apiLimiter);
}

// Health check.
//
// This has to actually touch Postgres. Returning a bare "ok" meant the process
// could be up while the database was unreachable, and the check would still
// pass — so Railway kept routing traffic to an instance that could not serve a
// single request. `SELECT 1` is the cheapest query that proves the connection
// pool can hand out a working connection.
//
// Failing returns 503 rather than throwing, so this reports "unhealthy" instead
// of being swallowed by the error handler and coming back as a generic 500.
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() });
  } catch {
    // Deliberately not surfacing the driver error — it can contain the
    // connection string, and this endpoint is unauthenticated.
    res.status(503).json({ status: "error", database: "unreachable", timestamp: new Date().toISOString() });
  }
});

// Routes
app.use("/accountant-reports", accountantReportRoutes);
app.use("/notices", noticeRoutes);
app.use("/fees", feeRoutes);
app.use("/seating", seatingRoutes);
app.use("/report-card-settings", reportCardSettingsRoutes);
app.use("/auth", authRoutes);
app.use("/school", schoolRoutes);
app.use("/academic-years", academicYearRoutes);
app.use("/grades", gradeRoutes);
app.use("/sections", sectionRoutes);
app.use("/subjects", subjectRoutes);
app.use("/exam-types", examTypeRoutes);
app.use("/grading-policy", gradingPolicyRoutes);
app.use("/students", studentRoutes);
app.use("/marks", markRoutes);
app.use("/reports", reportRoutes);
app.use("/teacher-assignments", teacherAssignmentRoutes);
app.use("/teachers", teacherRoutes);
app.use("/daily-attendance", dailyAttendanceRoutes);
app.use("/grade-sheet", gradeSheetRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/pdf", pdfRoutes);
app.use("/observations", observationRoutes);
app.use("/promotion", promotionRoutes);
app.use("/exam-routine", examRoutineRoutes);
app.use("/result-status", resultStatusRoutes);
app.use("/homework", homeworkRoutes);
app.use("/admissions", admissionRoutes);
app.use("/parents", parentRoutes);
app.use("/staff", staffRoutes);
app.use("/super-admin", superAdminRoutes);
app.use("/calendar-events", calendarRoutes);
app.use("/master-calendar", masterCalendarRoutes);
app.use("/gallery", galleryRoutes);
app.use("/public/gallery", publicGalleryRoutes);
app.use("/public/calendar", publicCalendarRoutes);
// Error handler (must be last)
app.use(errorHandler);

export default app;
