/**
 * backfill-student-photos-to-s3.ts
 *
 * Migrates student photos from base64 data URIs stored in the `photo` column
 * to S3, replacing the value with the S3 URL. Students whose photo is already
 * a URL (or null) are skipped.
 *
 * Requires AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in env.
 *
 * Safe to re-run: only rows starting with "data:" are touched.
 *
 * Usage — local (test DB):
 *   dotenv -e .env.test -- npx tsx prisma/backfill-student-photos-to-s3.ts
 *
 * Usage — production:
 *   railway run npx tsx prisma/backfill-student-photos-to-s3.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { uploadStudentPhoto } from "../src/services/upload.service";

async function main() {
  if (!process.env.AWS_S3_BUCKET) {
    console.error("AWS_S3_BUCKET is not set — cannot migrate photos to S3.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const students = await prisma.student.findMany({
      where: { photo: { startsWith: "data:" } },
      select: { id: true, photo: true, section: { select: { grade: { select: { academicYear: { select: { school: { select: { id: true } } } } } } } } },
    });

    console.log(`Found ${students.length} student(s) with base64 photos to migrate.`);

    let migrated = 0;
    let failed = 0;

    for (const student of students) {
      const schoolId = student.section.grade.academicYear.school.id;
      try {
        const result = await uploadStudentPhoto(student.photo!, schoolId, student.id);
        await prisma.student.update({
          where: { id: student.id },
          data: { photo: result.url },
        });
        migrated++;
        if (migrated % 10 === 0) console.log(`  migrated ${migrated}/${students.length}`);
      } catch (err) {
        failed++;
        console.error(`  FAILED student ${student.id}:`, err);
      }
    }

    console.log(`Done. Migrated: ${migrated}, failed: ${failed}, skipped: ${students.length - migrated - failed}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
