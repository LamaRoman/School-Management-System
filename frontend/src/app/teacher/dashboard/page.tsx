"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatGradeSection } from "@/lib/bsDate";
import { FileText, CalendarCheck, Table, ClipboardList, Users, BookOpen } from "lucide-react";

interface ClassTeacherSection {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
}

interface SubjectAssignment {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  subjectId: string;
  subjectName: string;
}

interface Student {
  id: string;
  sectionId: string;
}

export default function TeacherDashboardPage() {
  const [classTeacherSections, setClassTeacherSections] = useState<ClassTeacherSection[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [assignments, students] = await Promise.all([
          api.get<any>("/teacher-assignments/my"),
          api.get<Student[]>("/students"),
        ]);
        setClassTeacherSections(assignments.classTeacherSections || []);
        setSubjectAssignments(assignments.subjectAssignments || []);

        const counts: Record<string, number> = {};
        for (const stu of students) {
          counts[stu.sectionId] = (counts[stu.sectionId] || 0) + 1;
        }
        setStudentCounts(counts);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading...</div>;

  // A class teacher's own section is already fully covered by the class card
  // above (including a Marks Entry link) — listing it again per subject here
  // would just repeat the same section under every subject she teaches there.
  const ownSectionIds = new Set(classTeacherSections.map((sec) => sec.sectionId));
  const otherSubjectAssignments = subjectAssignments.filter((sa) => !ownSectionIds.has(sa.sectionId));

  const hasNothing = classTeacherSections.length === 0 && otherSubjectAssignments.length === 0;

  return (
    <div>
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

      {otherSubjectAssignments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Subjects You Teach</h2>
          <div className="space-y-4">
            {Object.entries(
              otherSubjectAssignments.reduce<Record<string, SubjectAssignment[]>>((groups, sa) => {
                (groups[sa.subjectName] ||= []).push(sa);
                return groups;
              }, {})
            ).map(([subjectName, sections]) => (
              <div key={subjectName} className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={16} className="text-gray-400" />
                  <span className="text-sm font-semibold text-primary">{subjectName}</span>
                  <span className="text-xs text-gray-400">({sections.length} {sections.length === 1 ? "section" : "sections"})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sections.map((sa) => (
                    <Link
                      key={sa.assignmentId}
                      href="/teacher/marks"
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary transition-all"
                    >
                      {formatGradeSection(sa.gradeName, sa.sectionName)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
