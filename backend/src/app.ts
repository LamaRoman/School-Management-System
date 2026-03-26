import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { errorHandler } from "./middleware/errorHandler";
import pdfRoutes from "./routes/pdf.routes";
import { closeBrowser } from "./services/pdf.service";

// Routes
import accountantReportRoutes from "./routes/accountantReport.routes";
import parentRoutes from "./routes/parent.routes";
import admissionRoutes from "./routes/admission.routes";
import noticeRoutes from "./routes/notice.routes";
import systemRoutes from "./routes/system.routes";
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

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/accountant-reports", accountantReportRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/seating", seatingRoutes);
app.use("/api/report-card-settings", reportCardSettingsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/school", schoolRoutes);
app.use("/api/academic-years", academicYearRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/sections", sectionRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/exam-types", examTypeRoutes);
app.use("/api/grading-policy", gradingPolicyRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/marks", markRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/teacher-assignments", teacherAssignmentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/daily-attendance", dailyAttendanceRoutes);
app.use("/api/grade-sheet", gradeSheetRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/observations", observationRoutes);
app.use("/api/promotion", promotionRoutes);
app.use("/api/exam-routine", examRoutineRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/homework", homeworkRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/parents", parentRoutes);
// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
});

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

export default app;
