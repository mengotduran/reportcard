-- CreateIndex
CREATE INDEX "User_schoolId_role_idx" ON "User"("schoolId", "role");

-- CreateIndex
CREATE INDEX "Student_schoolId_classLevel_idx" ON "Student"("schoolId", "classLevel");

-- CreateIndex
CREATE INDEX "FeePayment_schoolId_session_idx" ON "FeePayment"("schoolId", "session");

-- CreateIndex
CREATE INDEX "Subject_schoolId_classLevel_idx" ON "Subject"("schoolId", "classLevel");

-- CreateIndex
CREATE INDEX "Term_schoolId_isCurrent_idx" ON "Term"("schoolId", "isCurrent");

-- CreateIndex
CREATE INDEX "Term_schoolId_session_idx" ON "Term"("schoolId", "session");

-- CreateIndex
CREATE INDEX "ReportCard_schoolId_termId_idx" ON "ReportCard"("schoolId", "termId");

-- CreateIndex
CREATE INDEX "ReportCard_termId_idx" ON "ReportCard"("termId");

-- CreateIndex
CREATE INDEX "ReportEntry_reportCardId_idx" ON "ReportEntry"("reportCardId");

-- CreateIndex
CREATE INDEX "ReportEntry_subjectId_idx" ON "ReportEntry"("subjectId");

