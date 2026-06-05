import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import { generateToken } from '../utils/jwt'
import { AuthRequest } from '../middleware/auth'

// Register a new school + admin account
export const registerSchool = async (req: Request, res: Response) => {
  try {
    const { schoolName, schoolType, schoolEmail, schoolPhone, schoolAddress, subdomain, adminName, adminEmail, adminPassword } = req.body

    // Check if school email or subdomain already exists
    const existingSchool = await prisma.school.findFirst({
      where: { OR: [{ email: schoolEmail }, { subdomain }] }
    })
    if (existingSchool) {
      res.status(400).json({ message: 'School email or subdomain already exists' })
      return
    }

    // Check if admin email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (existingUser) {
      res.status(400).json({ message: 'Admin email already exists' })
      return
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12)

    // Create school and admin together
    const school = await prisma.school.create({
      data: {
        name: schoolName,
        type: schoolType,
        email: schoolEmail,
        phone: schoolPhone,
        address: schoolAddress,
        subdomain: subdomain.toLowerCase(),
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: 'SCHOOL_ADMIN',
          }
        }
      },
      include: { users: true }
    })

    const admin = school.users[0]
    const token = generateToken({ id: admin.id, role: admin.role, schoolId: school.id })

    res.status(201).json({
      message: 'School registered successfully',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      school: {
        id: school.id,
        name: school.name,
        type: school.type,
        subdomain: school.subdomain,
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email },
      include: { school: true }
    })

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const token = generateToken({
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
    })

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        masterClassLevel: user.masterClassLevel ?? null,
      },
      school: user.school ? {
        id: user.school.id,
        name: user.school.name,
        type: user.school.type,
        subdomain: user.school.subdomain,
        logo: user.school.logo,
        coverImage: user.school.coverImage,
        coverImages: user.school.coverImages,
      } : null
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Get logged in user
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { school: true }
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      masterClassLevel: user.masterClassLevel ?? null,
      school: user.school,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Superadmin self-recovery — no auth, uses SUPERADMIN_SECRET
export const resetSuperAdminPassword = async (req: Request, res: Response) => {
  try {
    const { secretKey, email, newPassword } = req.body
    if (!secretKey || secretKey !== process.env.SUPERADMIN_SECRET) {
      res.status(403).json({ message: 'Invalid secret key' })
      return
    }
    if (!email) {
      res.status(400).json({ message: 'Email is required' })
      return
    }
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' })
      return
    }
    const superAdmin = await prisma.user.findFirst({ where: { email, role: 'SUPERADMIN' } })
    if (!superAdmin) { res.status(404).json({ message: 'No superadmin found with that email' }); return }
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: superAdmin.id }, data: { password: hashed } })
    res.json({ message: 'Password reset successfully', email: superAdmin.email })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Reset any user's password (superadmin → admins; admin/VP → teachers in same school)
export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId)
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' }); return
    }
    const requesterRole = req.user!.role
    const requesterSchoolId = req.user!.schoolId

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target) { res.status(404).json({ message: 'User not found' }); return }

    if (requesterRole === 'SUPERADMIN') {
      if (target.role === 'SUPERADMIN') {
        res.status(403).json({ message: 'Cannot reset another superadmin\'s password' }); return
      }
    } else {
      // SCHOOL_ADMIN / VICE_PRINCIPAL
      if (target.schoolId !== requesterSchoolId) {
        res.status(403).json({ message: 'User not in your school' }); return
      }
      const teacherRoles = ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL']
      if (!teacherRoles.includes(target.role)) {
        res.status(403).json({ message: 'Can only reset passwords for teachers and vice principals' }); return
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } })
    res.json({ message: 'Password reset successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Create superadmin (run once)
export const createSuperAdmin = async (req: Request, res: Response) => {
  try {
    const { name, email, password, secretKey } = req.body

    if (secretKey !== process.env.SUPERADMIN_SECRET) {
      res.status(403).json({ message: 'Invalid secret key' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ message: 'Email already exists' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUPERADMIN',
        schoolId: null,
      }
    })

    res.status(201).json({
      message: 'Superadmin created',
      user: { id: superAdmin.id, name: superAdmin.name, email: superAdmin.email, role: superAdmin.role }
    })
  } catch (error) {
    console.error('SUPERADMIN ERROR:', JSON.stringify(error, null, 2))
    res.status(500).json({ message: 'Server error', error: String(error) })
  }
}
