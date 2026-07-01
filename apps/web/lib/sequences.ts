// Sequence numbering is continuous across terms (Cameroon system):
//   Term 1 → Seq 1, Seq 2
//   Term 2 → Seq 3, Seq 4
//   Term 3 → Seq 5, Seq 6
// Each term still stores its two marks in seq1Score / seq2Score — only the
// LABELS shown to users change based on which term it is (derived from name).

export function termSeqBase(termName?: string | null): number {
  const n = (termName || '').toLowerCase()
  if (n.includes('second') || n.includes('2nd') || /term\s*2\b/.test(n)) return 2
  if (n.includes('third') || n.includes('3rd') || /term\s*3\b/.test(n)) return 4
  return 0 // first term / default
}

// seqIndex is 0 or 1 (the two sequences within the term)
export function seqNumber(termName: string | null | undefined, seqIndex: number): number {
  return termSeqBase(termName) + seqIndex + 1
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
const ORDINALS_FR = ['Première', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième']

export function seqShort(termName: string | null | undefined, seqIndex: number, lang: 'EN' | 'FR' = 'EN'): string {
  return `${lang === 'FR' ? 'Séq' : 'Seq'} ${seqNumber(termName, seqIndex)}`
}

export function seqFull(termName: string | null | undefined, seqIndex: number, lang: 'EN' | 'FR' = 'EN'): string {
  const num = seqNumber(termName, seqIndex)
  if (lang === 'FR') return `${ORDINALS_FR[num - 1] ?? `${num}e`} Séquence`
  return `${ORDINALS[num - 1] ?? num} Sequence`
}
