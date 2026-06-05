import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'

export interface AuthRequest extends Request {
  user?: {
    id: string
    role: string
    schoolId: string | null
  }
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authorized, no token' })
    return
  }

  try {
    const token = authHeader.split(' ')[1]
    const decoded = verifyToken(token)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Not authorized, invalid token' })
  }
}

export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'You do not have permission to perform this action' })
      return
    }
    next()
  }
}
