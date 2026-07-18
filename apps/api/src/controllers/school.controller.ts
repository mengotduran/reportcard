import { Response } from 'express'
import path from 'path'
import fs from 'fs'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { UPLOAD_DIR } from '../config/uploads'
import { demoLimitBlock } from '../config/demo'
import { marksEntrySwitchAllowance, logMarksEntryModeChange } from '../utils/marksEntryMode'

export const getSchoolSettings = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }
    // Who switched who-enters-marks, newest first. Capped: the point is to show that a
    // switch happened and by whom, not to page through years of history.
    const marksEntryModeHistory = await prisma.marksEntryModeChange.findMany({
      where: { schoolId },
      orderBy: { changedAt: 'desc' },
      take: 10,
      select: { id: true, mode: true, changedByName: true, changedAt: true, byProvider: true },
    })
    // So the page can say "1 of 2 used this semester" rather than only discovering the
    // cap when the third switch is refused.
    const marksEntrySwitches = await marksEntrySwitchAllowance(schoolId)
    res.json({ school, marksEntryModeHistory, marksEntrySwitches })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateSchoolSettings = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, email, phone, address, website, acronym, batch, repeatThreshold, authorizationNumber, officialLeftTextEn, officialLeftTextFr, officialRightTextEn, officialRightTextFr, marksEntryMode } = req.body
    const data: Record<string, unknown> = {}
    if (name             !== undefined) data.name             = String(name).trim()
    if (phone            !== undefined) data.phone            = String(phone).trim() || null
    if (address          !== undefined) data.address          = String(address).trim() || null
    if (website          !== undefined) data.website          = String(website).trim() || null
    if (acronym          !== undefined) data.acronym          = String(acronym).trim().toUpperCase() || null
    if (batch            !== undefined) data.batch            = batch === null || batch === '' ? null : Number(batch)
    if (repeatThreshold  !== undefined) data.repeatThreshold  = repeatThreshold === null || repeatThreshold === '' ? null : Number(repeatThreshold)
    // Who records marks. Validated against the enum rather than passed through: an
    // unrecognised value would otherwise 500 at the database, and silently accepting a
    // typo here would leave a school believing marks were locked when they were not.
    if (marksEntryMode !== undefined && (marksEntryMode === 'TEACHERS' || marksEntryMode === 'ADMIN_ONLY')) data.marksEntryMode = marksEntryMode
    if (authorizationNumber !== undefined) data.authorizationNumber = String(authorizationNumber).trim() || null
    if (officialLeftTextEn  !== undefined) data.officialLeftTextEn  = String(officialLeftTextEn).trim() || null
    if (officialLeftTextFr  !== undefined) data.officialLeftTextFr  = String(officialLeftTextFr).trim() || null
    if (officialRightTextEn !== undefined) data.officialRightTextEn = String(officialRightTextEn).trim() || null
    if (officialRightTextFr !== undefined) data.officialRightTextFr = String(officialRightTextFr).trim() || null
    if (email            !== undefined) {
      const trimmed = String(email).trim().toLowerCase()
      if (!trimmed) { res.status(400).json({ message: 'Email is required' }); return }
      data.email = trimmed
    }
    // Read the mode BEFORE the write, so only a REAL change is capped and logged:
    // re-saving the same mode is not a switch, and must neither burn one of the school's
    // two nor fill the log with non-events.
    const before = data.marksEntryMode !== undefined
      ? await prisma.school.findUnique({ where: { id: schoolId }, select: { marksEntryMode: true } })
      : null
    const switching = !!before && before.marksEntryMode !== data.marksEntryMode

    // Twice per semester, then the provider does it. Checked here, not in the UI: a
    // disabled radio is a suggestion, and this cap is the whole point of the setting.
    const allowance = switching ? await marksEntrySwitchAllowance(schoolId) : null
    if (allowance && !allowance.allowed) {
      res.status(403).json({
        message: `You have already changed who enters marks ${allowance.used} times this semester. Contact your provider to change it again.`,
      })
      return
    }

    const school = await prisma.school.update({ where: { id: schoolId }, data })

    if (switching) {
      // Logged AFTER the update: a row claiming a switch that failed would be a lie.
      const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
      await logMarksEntryModeChange({
        schoolId,
        mode: school.marksEntryMode,
        changedById: req.user!.id,
        changedByName: actor?.name ?? 'Unknown',
        termId: allowance?.termId ?? null,
        byProvider: false,
      })
    }
    res.json({ school })
  } catch (error: any) {
    if (error?.code === 'P2002') { res.status(409).json({ message: 'That email is already in use by another school' }); return }
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const uploadLogo = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.logo) deleteFile(school.logo)

    const url = `/uploads/${req.file.filename}`
    const updated = await prisma.school.update({ where: { id: schoolId }, data: { logo: url } })
    res.json({ message: 'Logo uploaded', logo: updated.logo, school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Official stamp/seal. Same flow as the logo, but it prints only on OFFICIAL copies
// (placed via a `stamp` section in the designer), which is what distinguishes a copy
// the school seals and sends itself from the one handed to a student.
export const uploadStamp = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.stamp) deleteFile(school.stamp)

    const url = `/uploads/${req.file.filename}`
    const updated = await prisma.school.update({ where: { id: schoolId }, data: { stamp: url } })
    res.json({ message: 'Stamp uploaded', stamp: updated.stamp, school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const removeStamp = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.stamp) deleteFile(school.stamp)
    await prisma.school.update({ where: { id: schoolId }, data: { stamp: null } })
    res.json({ message: 'Stamp removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const uploadCover = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.coverImage) deleteFile(school.coverImage)

    const url = `/uploads/${req.file.filename}`
    const updated = await prisma.school.update({ where: { id: schoolId }, data: { coverImage: url } })
    res.json({ message: 'Cover image uploaded', coverImage: updated.coverImage, school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const removeLogo = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.logo) deleteFile(school.logo)
    await prisma.school.update({ where: { id: schoolId }, data: { logo: null } })
    res.json({ message: 'Logo removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const removeCover = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (school?.coverImage) deleteFile(school.coverImage)
    await prisma.school.update({ where: { id: schoolId }, data: { coverImage: null } })
    res.json({ message: 'Cover image removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Add a cover image to the coverImages array
export const addCoverImage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }
    const url = `/uploads/${req.file.filename}`
    const limit = await demoLimitBlock(schoolId, 'images')
    if (limit) { deleteFile(url); res.status(403).json({ message: limit }); return }
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    const current = school?.coverImages ?? []
    const updated = await prisma.school.update({ where: { id: schoolId }, data: { coverImages: [...current, url] } })
    res.json({ message: 'Cover image added', school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Remove a cover image by index
export const removeCoverImage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const index = Number(req.params.index)
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }
    const current = [...(school.coverImages ?? [])]
    if (index < 0 || index >= current.length) { res.status(400).json({ message: 'Invalid index' }); return }
    deleteFile(current[index])
    current.splice(index, 1)
    const updated = await prisma.school.update({ where: { id: schoolId }, data: { coverImages: current } })
    res.json({ message: 'Cover image removed', school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

function deleteFile(urlPath: string) {
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(urlPath))
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { /* ignore */ }
}
