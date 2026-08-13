'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getClassLevelsApi, type ClassLevel } from '@/lib/api/classLevels'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getDepartmentsApi, type Department } from '@/lib/api/departments'
import { getTermsApi } from '@/lib/api/terms'

// The school's reference data: classes, courses, departments, terms. It is read by
// most screens (class levels alone by 12 pages), it changes rarely, and until now
// every page re-read it on arrival. At ~450ms per round trip from Cameroon that was
// a visible pause on every single navigation.
//
// These are plain wrappers over the existing *Api functions — no endpoint changes,
// no response reshaping — so a page can adopt one by swapping its useState +
// useEffect pair for the hook and nothing else.

export const referenceKeys = {
  classLevels: ['reference', 'class-levels'] as const,
  subjects: ['reference', 'subjects'] as const,
  departments: ['reference', 'departments'] as const,
  terms: ['reference', 'terms'] as const,
}

export function useClassLevels(enabled = true) {
  const q = useQuery({
    queryKey: referenceKeys.classLevels,
    queryFn: getClassLevelsApi,
    enabled,
  })
  return { classLevels: (q.data?.classLevels ?? []) as ClassLevel[], ...q }
}

export function useSubjects(enabled = true) {
  const q = useQuery({
    queryKey: referenceKeys.subjects,
    queryFn: getSubjectsApi,
    enabled,
  })
  return { subjects: (q.data?.subjects ?? []) as { id: string; name: string; classLevel: string }[], ...q }
}

export function useDepartments(enabled = true) {
  const q = useQuery({
    queryKey: referenceKeys.departments,
    queryFn: getDepartmentsApi,
    enabled,
  })
  return { departments: (q.data?.departments ?? []) as Department[], ...q }
}

export function useTerms(enabled = true) {
  const q = useQuery({
    queryKey: referenceKeys.terms,
    queryFn: getTermsApi,
    enabled,
  })
  return { terms: (q.data?.terms ?? []) as { id: string; name: string; session: string; isCurrent: boolean }[], ...q }
}

// Call after any mutation that edits this data (creating a class, renaming a term,
// adding a course) so the next read refetches instead of serving a stale list.
// Deliberately explicit rather than automatic: these caches are long lived by
// design, so the write path has to say what it invalidated.
export function useInvalidateReference() {
  const qc = useQueryClient()
  return {
    classLevels: () => qc.invalidateQueries({ queryKey: referenceKeys.classLevels }),
    subjects: () => qc.invalidateQueries({ queryKey: referenceKeys.subjects }),
    departments: () => qc.invalidateQueries({ queryKey: referenceKeys.departments }),
    terms: () => qc.invalidateQueries({ queryKey: referenceKeys.terms }),
    all: () => qc.invalidateQueries({ queryKey: ['reference'] }),
  }
}
