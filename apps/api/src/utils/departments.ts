import { Department, SchoolType } from '@prisma/client'
import prisma from '../config/prisma'

// A secondary school should always have at least the default "Grammar" department,
// with every existing (untagged) class assigned to it — covers schools created before
// the backfill migration ran. Extracted so anything reading a school's departments
// (not just the Departments page itself) gets this guarantee, rather than depending on
// the Departments/Classes page having already been visited once first.
export async function ensureDepartments(schoolId: string, schoolType: SchoolType | undefined): Promise<Department[]> {
  let departments = await prisma.department.findMany({
    where: { schoolId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })

  if (schoolType === 'SECONDARY' && departments.length === 0) {
    const grammar = await prisma.department.create({
      data: { schoolId, name: 'Grammar', order: 0, isDefault: true },
    })
    await prisma.classLevel.updateMany({
      where: { schoolId, departmentId: null },
      data: { departmentId: grammar.id },
    })
    departments = [grammar]
  }

  return departments
}
