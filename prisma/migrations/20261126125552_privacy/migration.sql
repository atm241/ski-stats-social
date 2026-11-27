-- AlterTable
ALTER TABLE "SkiDay" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultVisibility" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "hideTrackEnds" BOOLEAN NOT NULL DEFAULT true;
