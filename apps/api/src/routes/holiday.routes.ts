import { Router } from 'express'
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../controllers/holiday.controller'
import { protect, restrictTo } from '../middleware/auth'

const router = Router()
router.use(protect)

// Readable by any signed-in user: a teacher's own timetable and hours need to know which
// days are cancelled, the same way they already read the bell schedule.
router.get('/', getHolidays)

// Defining them is an admin act, like terms and periods.
router.post('/', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), createHoliday)
router.put('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), updateHoliday)
router.delete('/:id', restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL'), deleteHoliday)

export default router
