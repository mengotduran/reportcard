'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYearsApi, AcademicYear } from '@/lib/api/dashboard'
import { CalendarRange, ArrowRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function AcademicYearPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const t = useT()
  const [years, setYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getAcademicYearsApi()
      .then((d) => setYears(d.academicYears))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">{t('Academic Year')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Pick a year to view its dashboard and statistics.')}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : years.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <CalendarRange size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t('No academic years yet. Add terms to get started.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {years.map((y) => (
            <button key={y.session}
              onClick={() => router.push(`/dashboard?year=${encodeURIComponent(y.session)}`)}
              className="group bg-card rounded-xl border border-border p-5 text-left hover:border-primary/40 hover:shadow-sm transition">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <CalendarRange size={20} />
                </div>
                {y.current && (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{t('Current')}</span>
                )}
              </div>
              <p className="text-lg font-bold text-foreground mt-3">{y.session}</p>
              <p className="text-sm text-primary flex items-center gap-1 mt-1 group-hover:gap-2 transition-all">
                {t('View dashboard')} <ArrowRight size={14} />
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
