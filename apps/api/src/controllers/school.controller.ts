import { Response } from 'express'
import path from 'path'
import fs from 'fs'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export const getSchoolSettings = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }
    res.json({ school })
  } catch (error) {
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
    const filePath = path.join(__dirname, '../../uploads', path.basename(urlPath))
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { /* ignore */ }
}
