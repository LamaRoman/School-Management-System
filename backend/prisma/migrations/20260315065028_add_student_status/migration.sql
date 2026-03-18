-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'TRANSFERRED_OUT', 'RETAINED');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';
