-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_privateSubjectId_fkey" FOREIGN KEY ("privateSubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

