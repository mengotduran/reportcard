import api from './client'
import { CompetencyLevel, DEFAULT_COMPETENCY_LEVELS } from '../competency'

export interface CompetencyScaleResponse {
  levels: CompetencyLevel[]
  /** True when the school has no scale of its own and is being served the built-ins. */
  isDefault: boolean
  /** Non-null once a rated class has published cards for a closed term of this session:
   *  the wording is settled for the year, so the editor must be read-only. */
  frozenBy: { className: string; termName: string } | null
  limits: { min: number; max: number }
}

const FALLBACK: CompetencyScaleResponse = {
  levels: DEFAULT_COMPETENCY_LEVELS,
  isDefault: true,
  frozenBy: null,
  limits: { min: 2, max: 6 },
}

/**
 * The rating levels in force for the signed-in user's school.
 *
 * Never rejects. Every caller is a rendering path, and on a phone a flaky connection is the
 * normal case — a teacher rating a class must not be blocked by a settings lookup, so a
 * failure falls back to the same built-ins the server would send for an uncustomised school.
 */
export async function getCompetencyScaleApi(): Promise<CompetencyScaleResponse> {
  try {
    const { data } = await api.get('/competency-scale')
    return {
      levels: Array.isArray(data?.levels) && data.levels.length > 0 ? data.levels : DEFAULT_COMPETENCY_LEVELS,
      isDefault: data?.isDefault ?? true,
      frozenBy: data?.frozenBy ?? null,
      limits: data?.limits ?? FALLBACK.limits,
    }
  } catch {
    return FALLBACK
  }
}

/** Admin only. `reset` drops the school's row so it goes back to tracking the built-ins. */
export async function saveCompetencyScaleApi(
  levels: CompetencyLevel[],
  reset = false
): Promise<CompetencyScaleResponse> {
  const { data } = await api.put('/competency-scale', { levels, reset })
  return data
}
