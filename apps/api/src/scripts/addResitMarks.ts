/**
 * Dev helper: retroactively adds resit marks to a chunk of existing failing
 * (F-grade) course entries at every UNIVERSITY school, so the resit feature
 * (Resit tab, red marks, asterisk, Resits table) has real data to look at.
 * Leaves ~25% of failing entries un-resat so the "still eligible, not yet
 * entered" state is visible too. Re-run safely — only touches entries that
 * don't already have a resitScore.
 */
import prisma from '../config/prisma'

const RESIT_RATE = 0.75 // fraction of currently-failing entries that get a resit

async function main() {
  const schools = await prisma.school.findMany({ where: { type: 'UNIVERSITY' }, select: { id: true, name: true } })
  if (schools.length === 0) {
    console.log('No UNIVERSITY schools found — nothing to do.')
    return
  }

  for (const school of schools) {
    const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId: school.id } })
    const rawRanges = gradingScale?.ranges as any
    const ranges: any[] = Array.isArray(rawRanges) ? rawRanges : (rawRanges?.ranges ?? [])
    const uniRanges = ranges.filter((r) => r.gradePoint != null)
    if (uniRanges.length === 0) {
      console.log(`Skipping "${school.name}" — no GPA grading scale set.`)
      continue
    }
    const gpForMark = (score: number) => {
      const sorted = [...uniRanges].sort((a, b) => b.minScore - a.minScore)
      return sorted.find((r) => score >= r.minScore && score <= r.maxScore) ?? sorted[sorted.length - 1]
    }

    const failing = await prisma.reportEntry.findMany({
      where: { reportCard: { schoolId: school.id }, score: { lt: 45 }, resitScore: null },
      select: { id: true, reportCardId: true, seq1Score: true },
    })
    if (failing.length === 0) {
      console.log(`"${school.name}": no un-resat failing entries found.`)
      continue
    }

    let resatCount = 0
    const affectedCardIds = new Set<string>()
    for (const entry of failing) {
      if (Math.random() > RESIT_RATE) continue
      const seq1 = entry.seq1Score ?? 0
      // Aim for a modest pass (D–B territory), not a miraculous A.
      const targetTotal = 45 + Math.random() * 25 // 45–70
      const resitScore = Math.max(0, Math.min(70, Math.round(targetTotal - seq1)))
      const newScore = seq1 + resitScore
      const g = gpForMark(newScore)
      await prisma.reportEntry.update({
        where: { id: entry.id },
        data: { resitScore, score: newScore, grade: g.grade, remarks: g.remark },
      })
      affectedCardIds.add(entry.reportCardId)
      resatCount++
    }

    // Recompute each affected card's credit-weighted average (GPA), same formula as seedUniversity.
    for (const cardId of affectedCardIds) {
      const entries = await prisma.reportEntry.findMany({
        where: { reportCardId: cardId, score: { not: null } },
        include: { subject: { select: { credit: true } } },
      })
      let wp = 0, cr = 0
      for (const e of entries) {
        const credit = e.subject.credit ?? 0
        wp += gpForMark(e.score!).gradePoint * credit
        cr += credit
      }
      const gpa = cr > 0 ? wp / cr : 0
      await prisma.reportCard.update({ where: { id: cardId }, data: { average: gpa, totalScore: wp } })
    }

    console.log(`"${school.name}": ${failing.length} failing entries found, resat ${resatCount} across ${affectedCardIds.size} report cards (${failing.length - resatCount} left un-resat for manual testing).`)
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
