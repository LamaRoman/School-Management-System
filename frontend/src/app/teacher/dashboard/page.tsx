"use client";
import useSWR from "swr";
import Link from "next/link";
import { formatGradeSection } from "@/lib/bsDate";
import { useMyAssignments } from "@/hooks/useReferenceData";
import { FileText, CalendarCheck, Table, ClipboardList, Users, BookOpen, Megaphone, CalendarDays } from "lucide-react";

interface Student {
  id: string;
  sectionId: string;
}

export default function TeacherDashboardPage() {
  const { classTeacherSections, subjectAssignments, loading: loadingAssignments } = useMyAssignments();
  const { data: students, isLoading: loadingStudents } = useSWR<Student[]>("/students");
  const loading = loadingAssignments || loadingStudents;

  const studentCounts: Record<string, number> = {};
  for (const stu of students ?? []) {
    studentCounts[stu.sectionId] = (studentCounts[stu.sectionId] || 0) + 1;
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  const hasNothing = classTeacherSections.length === 0 && subjectAssignments.length === 0;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {hasNothing && (
        <div className="card p-8 text-center text-gray-400">
          You have no class or subject assignments yet.
        </div>
      )}

      {classTeacherSections.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Class</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {classTeacherSections.map((sec) => (
              <div key={sec.assignmentId} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-primary text-lg">
                    {formatGradeSection(sec.gradeName, sec.sectionName)}
                  </h3>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={14} /> {studentCounts[sec.sectionId] ?? 0} Students
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/teacher/my-class" className="btn-ghost text-xs border border-gray-200">
                    <FileText size={14} /> Report Card
                  </Link>
                  <Link href="/teacher/attendance" className="btn-ghost text-xs border border-gray-200">
                    <CalendarCheck size={14} /> Attendance
                  </Link>
                  <Link href="/teacher/grade-sheet" className="btn-ghost text-xs border border-gray-200">
                    <Table size={14} /> Grade Sheet
                  </Link>
                  <Link href="/teacher/observations" className="btn-ghost text-xs border border-gray-200">
                    <ClipboardList size={14} /> Observations
                  </Link>
                  <Link href="/teacher/marks" className="btn-ghost text-xs border border-gray-200">
                    <BookOpen size={14} /> Marks Entry
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {classTeacherSections.length === 0 && subjectAssignments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Subjects</h2>
          <div className="card p-5 flex flex-wrap gap-2">
            <Link href="/teacher/marks" className="btn-ghost text-xs border border-gray-200">
              <ClipboardList size={14} /> Marks Entry
            </Link>
            <Link href="/teacher/homework" className="btn-ghost text-xs border border-gray-200">
              <BookOpen size={14} /> Homework
            </Link>
            <Link href="/teacher/exam-routine" className="btn-ghost text-xs border border-gray-200">
              <CalendarDays size={14} /> Exam Routine
            </Link>
            <Link href="/teacher/notices" className="btn-ghost text-xs border border-gray-200">
              <Megaphone size={14} /> Notices
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
