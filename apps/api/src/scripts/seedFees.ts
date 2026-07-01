/**
 * Seeds realistic school-fee payments for Greenfield's two academic years.
 *  - 2024/2025 (finished): everybody paid in full.
 *  - 2025/2026 (last term, in progress): most paid in full, the rest almost done.
 * Fees are scoped per academic session; each student's due = their class fee
 * (stream-aware, e.g. "Form 4 Arts" -> "Form 4"). Re-run to reset (wipes first).
 */
import { randomUUID } from 'crypto'
import prisma from '../config/prisma'

interface ClassFee { name: string; feeAmount: number; hasStream: boolean }
function feeResolver(classes: ClassFee[]) {
  return (classLevel: string): number => {
    const exact = classes.find((c) => c.name === classLevel)
    if (exact) return exact.feeAmount
    const streamed = classes.find((c) => c.hasStream && classLevel.startsWith(`${c.name} `))
    return streamed ? streamed.feeAmount : 0
  }
}

const rnd = (n: number) => Math.floor(Math.random() * n)
const round5k = (v: number) => Math.max(5000, Math.round(v / 5000) * 5000)

/** Split a target amount into 1–3 dated installments across the school year. */
function installments(total: number, startMs: number, endMs: number): { amount: number; paidOn: Date }[] {
  if (total <= 0) return []
  const n = total <= 5000 ? 1 : [1, 2, 2, 3][rnd(4)]
  const dateAt = (i: number) => new Date(startMs + ((i + 0.5) / n) * (endMs - startMs) + rnd(20) * 86400000)
  if (n === 1) return [{ amount: total, paidOn: dateAt(0) }]
  const out: { amount: number; paidOn: Date }[] = []
  let remaining = total
  for (let i = 0; i < n - 1; i++) {
    const part = Math.min(remaining - 5000, round5k(total / n))
    out.push({ amount: part, paidOn: dateAt(i) })
    remaining -= part
  }
  out.push({ amount: remaining, paidOn: dateAt(n - 1) })
  return out.filter((p) => p.amount > 0)
}

async function chunked(rows: any[], size = 2000) {
  for (let i = 0; i < rows.length; i += size) await prisma.feePayment.createMany({ data: rows.slice(i, i + size) })
}

const WINDOWS: Record<string, [number, number]> = {
  '2024/2025': [Date.parse('2024-09-15'), Date.parse('2025-06-15')],
  '2025/2026': [Date.parse('2025-09-15'), Date.parse('2026-06-20')],
}

async function main() {
  const school = await prisma.school.findFirst({ where: { OR: [{ subdomain: 'greenfield-primary' }, { name: 'Greenfield Academy' }] } })
  if (!school) throw new Error('Greenfield Academy not found')
  const schoolId = school.id
  const classes = await prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, feeAmount: true, hasStream: true } })
  const feeFor = feeResolver(classes)

  await prisma.feePayment.deleteMany({ where: { schoolId } })
  console.log(`Seeding fees into "${school.name}".`)

  for (const session of Object.keys(WINDOWS)) {
    const [start, end] = WINDOWS[session]
    const students = await prisma.student.findMany({
      where: { schoolId, reportCards: { some: { term: { session } } } },
      select: { id: true, classLevel: true },
    })
    const rows: any[] = []
    let complete = 0, partial = 0
    for (const s of students) {
      const due = feeFor(s.classLevel)
      if (due <= 0) continue
      // 2024/25 finished -> full. 2025/26 -> ~72% full, rest almost done (55–95%).
      const full = session === '2024/2025' || Math.random() < 0.72
      const target = full ? due : Math.min(due - 5000, round5k(due * (0.55 + Math.random() * 0.4)))
      full ? complete++ : partial++
      for (const inst of installments(target, start, end)) {
        rows.push({ id: randomUUID(), schoolId, studentId: s.id, session, amount: inst.amount, paidOn: inst.paidOn, note: 'Fee installment', recordedBy: null })
      }
    }
    await chunked(rows)
    console.log(`${session}: ${students.length} students — ${complete} fully paid, ${partial} partial; ${rows.length} payments.`)
  }
  console.log('Done.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
