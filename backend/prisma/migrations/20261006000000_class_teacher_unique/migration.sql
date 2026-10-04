-- A class-teacher row has no subject, and Postgres treats NULLs as distinct, so the table's
-- unique key (teacher_id, section_id, subject_id) never stopped the same teacher being stored
-- as class teacher of the same section twice (a double-submitted form did exactly that, and the
-- dashboard listed the class twice). A partial unique index closes it.

-- 1. Remove exact repeats only (same teacher, same section, both class-teacher rows), keeping
--    one: a permanent row over a temporary one, then the oldest. Nothing references these rows.
DELETE FROM teacher_assignments t
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY teacher_id, section_id
           ORDER BY is_temporary ASC, created_at ASC, id ASC
         ) AS rn
  FROM teacher_assignments
  WHERE is_class_teacher
) d
WHERE t.id = d.id AND d.rn > 1;

-- 2. One class teacher per section — the rule POST /teacher-assignments already states. Two
--    DIFFERENT teachers on one section is a decision for the school, not for a migration, and a
--    failing migration would stop the deploy booting; so if that data exists, fall back to the
--    narrower rule (same teacher at most once per section) and say so.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM teacher_assignments WHERE is_class_teacher
    GROUP BY section_id HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Sections with more than one class teacher exist; creating the per-teacher index only.';
    CREATE UNIQUE INDEX "teacher_assignments_class_teacher_teacher_section_key"
      ON teacher_assignments (teacher_id, section_id) WHERE is_class_teacher;
  ELSE
    CREATE UNIQUE INDEX "teacher_assignments_one_class_teacher_per_section_key"
      ON teacher_assignments (section_id) WHERE is_class_teacher;
  END IF;
END $$;
