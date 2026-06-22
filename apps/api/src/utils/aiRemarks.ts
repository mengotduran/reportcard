// AI-assisted bilingual (EN/FR) report-card remarks.
//
// Design goals:
//  - Provider-agnostic: talks to any OpenAI-compatible chat endpoint. Default
//    config points at Google Gemini's OpenAI-compatible API, but switching to
//    Groq / Mistral / OpenRouter is purely an env change (base URL + key + model).
//  - Never blocks report generation: on any failure (missing key, network,
//    quota, bad JSON) it falls back to a static bilingual band default.
//  - Free-tier friendly: results are cached by rounded average and the student
//    name is NEVER sent to the provider — we use a {{NAME}} placeholder and
//    substitute locally. So API calls scale with distinct averages, not students,
//    and no pupil PII leaves the server.

export type BandKey = 'excellent' | 'veryGood' | 'good' | 'average' | 'belowAverage' | 'weak'

interface Band {
  key: BandKey
  min: number // inclusive
  label: string
  // Static bilingual fallback, with {{NAME}} placeholder.
  fallback: { en: string; fr: string }
}

// Ordered high → low. Average is out of 20.
const BANDS: Band[] = [
  {
    key: 'excellent', min: 16, label: 'excellent',
    fallback: {
      en: '{{NAME}} has produced excellent work this term and demonstrates a strong command of the material. Keep up this outstanding effort.',
      fr: "{{NAME}} a fourni un excellent travail ce trimestre et maîtrise parfaitement la matière. Continue ainsi, ce travail remarquable mérite d'être maintenu.",
    },
  },
  {
    key: 'veryGood', min: 14, label: 'very good',
    fallback: {
      en: '{{NAME}} has performed very well this term and shows real understanding. A little more consistency will lead to excellent results.',
      fr: "{{NAME}} a très bien travaillé ce trimestre et fait preuve d'une réelle compréhension. Un peu plus de régularité conduira à d'excellents résultats.",
    },
  },
  {
    key: 'good', min: 12, label: 'good',
    fallback: {
      en: '{{NAME}} has done good work this term. With sustained effort, even better results are within reach.',
      fr: "{{NAME}} a réalisé un bon travail ce trimestre. Avec des efforts soutenus, de meilleurs résultats sont à portée de main.",
    },
  },
  {
    key: 'average', min: 10, label: 'average',
    fallback: {
      en: '{{NAME}} has achieved an average performance this term. More regular study and focus will help raise these results.',
      fr: "{{NAME}} a obtenu des résultats moyens ce trimestre. Un travail plus régulier et plus de concentration aideront à progresser.",
    },
  },
  {
    key: 'belowAverage', min: 8, label: 'below average',
    fallback: {
      en: "{{NAME}}'s results are below average this term. Sustained effort and support will be needed to improve next term.",
      fr: "Les résultats de {{NAME}} sont en dessous de la moyenne ce trimestre. Des efforts soutenus et un accompagnement seront nécessaires pour progresser.",
    },
  },
  {
    key: 'weak', min: 0, label: 'weak',
    fallback: {
      en: '{{NAME}} has struggled this term and needs to make a serious, consistent effort. With determination and support, progress is possible.',
      fr: "{{NAME}} a rencontré des difficultés ce trimestre et doit fournir un effort sérieux et régulier. Avec de la détermination et un accompagnement, des progrès sont possibles.",
    },
  },
]

export function bandFor(average: number): Band {
  return BANDS.find(b => average >= b.min) ?? BANDS[BANDS.length - 1]
}

const NAME_TOKEN = '{{NAME}}'

export type RemarkLang = 'EN' | 'FR'

export interface RemarkResult {
  text: string
  source: 'ai' | 'fallback'
}

// ---- provider config (all overridable via env) ----
const BASE_URL = process.env.AI_BASE_URL
  || 'https://generativelanguage.googleapis.com/v1beta/openai'
// GEMINI_API_KEY kept as the primary name per the original spec; AI_API_KEY is a
// generic alias so a provider swap doesn't require renaming the secret.
const API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || ''
const MODEL = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.5-flash-lite'

// ---- cache + throttle (process-level) ----
// Keyed by band+rounded average so two pupils with the same average reuse one
// call. Holds the {{NAME}}-tokenised template, not a finished remark.
const cache = new Map<string, string>()
let lastCallAt = 0
const MIN_INTERVAL_MS = 4000 // ~15 req/min, safely under the free Flash limit

async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCallAt = Date.now()
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function buildMessages(band: Band, average: number, lang: RemarkLang) {
  const langName = lang === 'FR' ? 'French' : 'English'
  const system = [
    'You are an experienced class teacher signing a student report card.',
    `Write exactly ONE short remark about ONE student, written in ${langName}.`,
    'The remark is 1 to 2 sentences. Formal, encouraging but honest. No clichés, no emojis.',
    `The student's performance band is "${band.label}" with an end-of-term average of ${average} out of 20.`,
    'Mention the performance level and one forward-looking note (encouragement or an area to improve) suited to that band.',
    `Refer to the student using the literal placeholder ${NAME_TOKEN} exactly where the name should appear (do not invent a name).`,
    'Return ONLY valid JSON, no markdown fences, in exactly this shape: {"text": "..."}',
  ].join(' ')
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Average: ${average}/20. Band: ${band.label}. Language: ${langName}. Write the remark now.` },
  ]
}

async function callProvider(band: Band, average: number, lang: RemarkLang): Promise<string> {
  await throttle()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.8,
      messages: buildMessages(band, average, lang),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI provider ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as any
  const content: string = data?.choices?.[0]?.message?.content ?? ''
  const parsed = JSON.parse(stripFences(content))
  if (typeof parsed.text !== 'string' || !parsed.text.trim()) {
    throw new Error('AI returned JSON without a valid text string')
  }
  // Ensure the placeholder survived; if the model dropped it, prepend the name slot.
  const sep = lang === 'FR' ? ' : ' : ': '
  const text = parsed.text.includes(NAME_TOKEN) ? parsed.text : `${NAME_TOKEN}${sep}${parsed.text}`
  return text.trim()
}

/**
 * Generate a single-language remark for a student. Never throws — degrades to
 * the static band fallback so report generation is never blocked.
 */
export async function generateRemark(name: string, average: number, lang: RemarkLang = 'EN'): Promise<RemarkResult> {
  const band = bandFor(average)
  const safeName = (name || 'The student').trim()
  const fallbackText = lang === 'FR' ? band.fallback.fr : band.fallback.en
  const fill = (template: string, source: 'ai' | 'fallback'): RemarkResult => ({
    text: template.split(NAME_TOKEN).join(safeName),
    source,
  })

  const cacheKey = `${lang}:${band.key}:${average.toFixed(1)}`
  const cached = cache.get(cacheKey)
  if (cached) return fill(cached, 'ai')

  if (!API_KEY) {
    // No provider configured — use the band default in the requested language.
    return fill(fallbackText, 'fallback')
  }

  // Try once, retry once, then fall back.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const template = await callProvider(band, average, lang)
      cache.set(cacheKey, template)
      return fill(template, 'ai')
    } catch (err) {
      console.error(`generateRemark attempt ${attempt + 1} failed:`, (err as Error).message)
    }
  }
  return fill(fallbackText, 'fallback')
}

/**
 * Provenance: given the saved EN/FR text and the stored AI draft, classify how
 * the remark came to be. Used by the controller at save time.
 */
export function classifyRemarkSource(
  savedEn: string | null | undefined,
  savedFr: string | null | undefined,
  aiEn: string | null | undefined,
  aiFr: string | null | undefined,
): 'AI' | 'AI_EDITED' | 'MANUAL' | null {
  const en = (savedEn ?? '').trim()
  const fr = (savedFr ?? '').trim()
  if (!en && !fr) return null
  if (!aiEn && !aiFr) return 'MANUAL'
  const unchanged = en === (aiEn ?? '').trim() && fr === (aiFr ?? '').trim()
  return unchanged ? 'AI' : 'AI_EDITED'
}
