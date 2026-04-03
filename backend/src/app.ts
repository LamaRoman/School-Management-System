import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { errorHandler } from "./middleware/errorHandler";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pdfRoutes from "./routes/pdf.routes";
import { closeBrowser } from "./services/pdf.service";

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
import observationRoutes from "./routes/observation.routes";
import feeRoutes from "./routes/fee.routes";
import homeworkRoutes from "./routes/homework.routes";


dotenv.config();

// ─── Validate required env vars on startup ────────────────
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security middleware ──────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ─── Rate limiting ────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth/login", loginLimiter);
app.use("/", apiLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
app.use("/homework", homeworkRoutes);
app.use("/admissions", admissionRoutes);
app.use("/parents", parentRoutes);
// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
});

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

export default app;
