import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import authRoutes from './routes/auth.routes'
import studentRoutes from './routes/student.routes'
import subjectRoutes from './routes/subject.routes'
import termRoutes from './routes/term.routes'
import reportCardRoutes from './routes/reportcard.routes'
import teacherRoutes from './routes/teacher.routes'
import dashboardRoutes from './routes/dashboard.routes'
import superadminRoutes from './routes/superadmin.routes'
import schoolRoutes from './routes/school.routes'
import classLevelRoutes from './routes/classlevel.routes'
import reportCardTemplateRoutes from './routes/reportcardtemplate.routes'
import classListTemplateRoutes from './routes/classlisttemplate.routes'
import gradingScaleRoutes from './routes/gradingscale.routes'
import demoRoutes from './routes/demo.routes'
import { UPLOAD_DIR } from './config/uploads'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(UPLOAD_DIR))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ReportCard API is running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/subjects', subjectRoutes)
app.use('/api/terms', termRoutes)
app.use('/api/report-cards', reportCardRoutes)
app.use('/api/teachers', teacherRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/superadmin', superadminRoutes)
app.use('/api/school', schoolRoutes)
app.use('/api/class-levels', classLevelRoutes)
app.use('/api/report-card-template', reportCardTemplateRoutes)
app.use('/api/class-list-template', classListTemplateRoutes)
app.use('/api/grading-scale', gradingScaleRoutes)
app.use('/api/demo', demoRoutes)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
