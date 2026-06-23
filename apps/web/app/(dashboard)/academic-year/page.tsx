'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYearsApi, AcademicYear } from '@/lib/api/dashboard'
import { CalendarRange, Check, ArrowRight } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useToast } from '@/lib/useToast'
import Toast from '@/components/ui/Toast'

export default function AcademicYearPage() {
  const router = useRouter()
  const { isAuthenticated, activeSession, setActiveSession } = useAuthStore()
  const t = useT()
  const { toast, showToast, hideToast } = useToast()
  const [years, setYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getAcademicYearsApi()
      .then((d) => setYears(d.academicYears))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  const activate = (session: string) => {
    setActiveSession(session)
    showToast(`${t('Now viewing academic year')} ${session}`)
    setTimeout(() => router.push('/dashboard'), 400)
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">{t('Academic Year')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('Activate a year to view its data across the whole app.')}</p>
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
          {years.map((y) => {
            const isActive = activeSession === y.session
            return (
              <div key={y.session}
                className={`rounded-xl border p-5 transition ${isActive ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                    <CalendarRange size={20} />
                  </div>
                  <div className="flex gap-1.5">
                    {y.current && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 h-fit">{t('Live term')}</span>
                    )}
                    {isActive && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 h-fit flex items-center gap-1"><Check size={11} />{t('Active')}</span>
                    )}
                  </div>
                </div>
                <p className="text-lg font-bold text-foreground mt-3">{y.session}</p>
                {isActive ? (
                  <p className="text-sm text-muted-foreground mt-1">{t('Currently viewing')}</p>
                ) : (
                  <button onClick={() => activate(y.session)}
                    className="text-sm text-primary font-medium flex items-center gap-1 mt-1 hover:gap-2 transition-all">
                    {t('Activate this year')} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
