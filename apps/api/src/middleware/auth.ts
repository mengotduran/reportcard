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

/**
 * Refuses a PARENT token outright. Mounted once in index.ts ahead of every staff route.
 *
 * Without it, a parent reaches any staff route that happens to lack a `restrictTo` — and
 * several do, because until now every authenticated user WAS staff. Nothing leaked, but only
 * by accident: a parent's schoolId is null, so those handlers threw a 500 or a 400 on a
 * `where: { schoolId: undefined }` instead of refusing. Relying on that is the same
 * maintenance trap as the delete lists — it holds until someone adds a route that tolerates a
 * missing schoolId, and then it silently does not.
 *
 * Deliberately a blanket deny rather than a per-route allow: a parent has exactly one
 * surface (/api/parent), so anything else reaching them is a mistake by definition.
 *
 * A malformed or absent token is passed through untouched, so each route's own `protect`
 * still produces the normal 401 rather than this middleware masking it.
 */
export const denyParents = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) { next(); return }
  try {
    const decoded = verifyToken(authHeader.split(' ')[1])
    if (decoded.role === 'PARENT') {
      res.status(403).json({ message: 'You do not have permission to perform this action' })
      return
    }
  } catch { /* let the route's own protect handle a bad token */ }
  next()
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
