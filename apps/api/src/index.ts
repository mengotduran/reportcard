import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import http from 'http'
import authRoutes from './routes/auth.routes'
import passwordResetRoutes from './routes/passwordReset.routes'
import studentRoutes from './routes/student.routes'
import parentRoutes from './routes/parent.routes'
import { denyParents } from './middleware/auth'
import subjectRoutes from './routes/subject.routes'
import termRoutes from './routes/term.routes'
import reportCardRoutes from './routes/reportcard.routes'
import teacherRoutes from './routes/teacher.routes'
import dashboardRoutes from './routes/dashboard.routes'
import superadminRoutes from './routes/superadmin.routes'
import schoolRoutes from './routes/school.routes'
import classLevelRoutes from './routes/classlevel.routes'
import departmentRoutes from './routes/department.routes'
import reportCardTemplateRoutes from './routes/reportcardtemplate.routes'
import classListTemplateRoutes from './routes/classlisttemplate.routes'
import gradingScaleRoutes from './routes/gradingscale.routes'
import competencyScaleRoutes from './routes/competencyscale.routes'
import promotionScaleRoutes from './routes/promotionScale.routes'
import demoRoutes from './routes/demo.routes'
import feesRoutes from './routes/fees.routes'
import hndRegistrationRoutes from './routes/hndRegistration.routes'
import backupRoutes from './routes/backup.routes'
import uploadsBackupRoutes from './routes/uploadsBackup.routes'
import excelTemplateRoutes from './routes/excelTemplate.routes'
import timetableRoutes from './routes/timetable.routes'
import pastTermGrantRoutes from './routes/pastTermGrant.routes'
import teacherAbsenceRoutes from './routes/teacherAbsence.routes'
import coverageRoutes from './routes/coverage.routes'
import notificationRoutes from './routes/notification.routes'
import holidayRoutes from './routes/holiday.routes'
import { UPLOAD_DIR } from './config/uploads'
import { initSocket } from './config/socket'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(UPLOAD_DIR))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Bulletin API is running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/auth', passwordResetRoutes)
app.use('/api/parent', parentRoutes)

// Everything registered below this line is STAFF ONLY. A parent's entire surface is
// /api/parent above; see denyParents for why this is a blanket deny rather than a
// per-route allow.
app.use(denyParents)
app.use('/api/students', studentRoutes)
app.use('/api/subjects', subjectRoutes)
app.use('/api/terms', termRoutes)
app.use('/api/report-cards', reportCardRoutes)
app.use('/api/teachers', teacherRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/superadmin', superadminRoutes)
app.use('/api/school', schoolRoutes)
app.use('/api/class-levels', classLevelRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/report-card-template', reportCardTemplateRoutes)
app.use('/api/class-list-template', classListTemplateRoutes)
app.use('/api/grading-scale', gradingScaleRoutes)
app.use('/api/competency-scale', competencyScaleRoutes)
app.use('/api/promotion-scale', promotionScaleRoutes)
app.use('/api/fees', feesRoutes)
app.use('/api/hnd-registration', hndRegistrationRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/backup', backupRoutes)
// Operator-only, secret-guarded, disabled unless UPLOADS_BACKUP_SECRET is set. See the route file.
app.use('/api/uploads-backup', uploadsBackupRoutes)
app.use('/api/excel-templates', excelTemplateRoutes)
app.use('/api/timetable', timetableRoutes)
app.use('/api/past-term-grants', pastTermGrantRoutes)
app.use('/api/teacher-absences', teacherAbsenceRoutes)
app.use('/api/coverage', coverageRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/holidays', holidayRoutes)

// Socket.IO needs the underlying HTTP server, not the Express app, so the listen call moves
// onto an explicit server. Same port: real-time shares the API's origin, which keeps the
// offline install working (one host, one port) and means no extra firewall rule anywhere.
const httpServer = http.createServer(app)
initSocket(httpServer)

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (REST + realtime)`)
})

export default app
