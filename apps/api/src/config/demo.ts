import prisma from './prisma'

// The disposable demo tenant (see scripts/seedDemo.ts) is identified by this
// subdomain. Resource caps below apply ONLY to this school — every other
// (real) school is unlimited.
export const DEMO_SUBDOMAIN = 'demo'

export const DEMO_LIMITS = {
  students: 20,
  subjects: 20,
  teachers: 10,
  images: 10,
} as const

export type DemoResource = keyof typeof DEMO_LIMITS

// Teacher-type roles, matching teacher.controller's getTeachers filter.
const TEACHER_ROLES = ['CLASS_TEACHER', 'CLASS_MASTER', 'VICE_PRINCIPAL'] as const

/**
 * Returns a user-facing message if the DEMO school has hit its cap for the
 * given resource, otherwise null. For any non-demo school this always returns
 * null (no limits enforced), so it's safe to call from shared controllers.
 */
export async function demoLimitBlock(schoolId: string, resource: DemoResource): Promise<string | null> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { subdomain: true, logo: true, coverImage: true, coverImages: true },
  })
  if (!school || school.subdomain !== DEMO_SUBDOMAIN) return null

  const limit = DEMO_LIMITS[resource]
  let count = 0
  switch (resource) {
    case 'students':
      count = await prisma.student.count({ where: { schoolId } })
      break
    case 'subjects':
      count = await prisma.subject.count({ where: { schoolId } })
      break
    case 'teachers':
      count = await prisma.user.count({ where: { schoolId, isActive: true, role: { in: [...TEACHER_ROLES] } } })
      break
    case 'images':
      count = (school.logo ? 1 : 0) + (school.coverImage ? 1 : 0) + (school.coverImages?.length ?? 0)
      break
  }

  if (count >= limit) {
    return `Demo limit reached — this demo school is capped at ${limit} ${resource}. Delete some first to make room.`
  }
  return null
}
