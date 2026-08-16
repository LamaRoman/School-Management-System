"use client";
import useSWR from "swr";

export interface Section {
  id: string;
  name: string;
  _count?: { students: number };
}

export interface Grade {
  id: string;
  name: string;
  displayOrder: number;
  academicYearId: string;
  sections: Section[];
  _count: { subjects: number; sections: number };
}

export interface ExamType {
  id: string;
  name: string;
  isFinal: boolean;
  displayOrder: number;
  paperSize: string;
  showRank: boolean;
}

export interface AcademicYear {
  id: string;
  yearBS: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
}

// The active year and its grade/section tree change about twice a year, but
// nearly every page in the app opens by fetching both. One SWR key each means
// the pair is fetched once per session and shared, instead of once per page
// visit (F2/F5). Five minutes of deduping covers a working session's navigation
// without pinning a stale tree for an admin who is editing grades in another tab.
const REFERENCE = { dedupingInterval: 5 * 60_000 };

export function useActiveYear() {
  const { data, isLoading, mutate } = useSWR<AcademicYear | null>(
    "/academic-years/active",
    REFERENCE
  );
  return { activeYear: data ?? null, loading: isLoading, mutate };
}

/**
 * The active year together with its grades (sections included).
 *
 * `loading` stays true across both requests, so a caller can render one loading
 * state for the whole chain rather than flashing an empty grade list between
 * them. A school with no active year settles at `loading: false, grades: []` —
 * genuinely empty, not still loading.
 */
export interface ClassTeacherSection {
  assignmentId: string;
  sectionId: string;
  sectionName: string;
  gradeId: string;
  gradeName: string;
  academicYearId: string;
}

/**
 * The signed-in teacher's own assignments — which sections they teach and which
 * they are class teacher of. The teacher layout needs it on every page to decide
 * which tabs to show, and most teacher pages need it again for their section
 * selector; one key means they all read the same fetch.
 */
export function useMyAssignments() {
  const { data, isLoading } = useSWR<{
    classTeacherSections?: ClassTeacherSection[];
    subjectAssignments?: any[];
  }>("/teacher-assignments/my", REFERENCE);
  return {
    classTeacherSections: data?.classTeacherSections ?? [],
    subjectAssignments: data?.subjectAssignments ?? [],
    loading: isLoading,
  };
}

export function useExamTypes() {
  const { activeYear, loading: yearLoading } = useActiveYear();
  const { data, isLoading, mutate } = useSWR<ExamType[]>(
    activeYear ? `/exam-types?academicYearId=${activeYear.id}` : null,
    REFERENCE
  );
  return {
    activeYear,
    examTypes: data ?? [],
    loading: yearLoading || (!!activeYear && isLoading),
    mutate,
  };
}

export function useGrades() {
  const { activeYear, loading: yearLoading } = useActiveYear();
  const { data, isLoading, mutate } = useSWR<Grade[]>(
    activeYear ? `/grades?academicYearId=${activeYear.id}` : null,
    REFERENCE
  );
  return {
    activeYear,
    grades: data ?? [],
    loading: yearLoading || (!!activeYear && isLoading),
    mutate,
  };
}
