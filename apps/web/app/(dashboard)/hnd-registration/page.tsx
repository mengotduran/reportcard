'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getHndRegistrationListApi, updateDepartmentFeeApi, HndRegList, HndRegRow, DepartmentFeeRow, RegStatus } from '@/lib/api/hndRegistration'
import { formatXAF } from '@/lib/api/fees'
import { BookMarked, Search, X, Pencil, Check } from 'lucide-react'
import HndRegistrationModal from '@/components/ui/HndRegistrationModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/lib/useToast'
import { usePagination } from '@/lib/usePagination'

function StatusBadge({ status, balance }: { status: RegStatus; balance: number }) {
  if (status === 'COMPLETE') return <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Paid</span>
  const cls = status === 'UNPAID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  const label = status === 'UNPAID' ? 'Not paid' : `${formatXAF(balance)} left`
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

export default function HndRegistrationPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()

  const [data, setData] = useState<HndRegList | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDept, setActiveDept] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null)
  const [editingFee, setEditingFee] = useState<string | null>(null)   // classLevel being edited
  const [feeInput, setFeeInput] = useState('')
  const [savingFee, setSavingFee] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setData(await getHndRegistrationListApi())
    } catch {
      showToast('Failed to load HND registration data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    load()
  }, [isAuthenticated])

  const departments = useMemo(() => {
    if (!data) return []
    return ['ALL', ...Array.from(new Set(data.students.map((s) => s.department))).sort()]
  }, [data])

  const filtered = useMemo<HndRegRow[]>(() => {
    if (!data) return []
    let rows = activeDept === 'ALL' ? data.students : data.students.filter((s) => s.department === activeDept)
    if (search.trim()) rows = rows.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.studentIdCode.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [data, activeDept, search])

  const { page, totalPages, pageItems, setPage, total, pageSize } = usePagination(filtered, 30, `${activeDept}|${search}`)

  const stats = useMemo(() => {
    if (!data) return { total: 0, paid: 0, partial: 0, unpaid: 0 }
    const src = activeDept === 'ALL' ? data.students : data.students.filter((s) => s.department === activeDept)
    return {
      total:   src.length,
      paid:    src.filter((s) => s.status === 'COMPLETE').length,
      partial: src.filter((s) => s.status === 'PARTIAL').length,
      unpaid:  src.filter((s) => s.status === 'UNPAID').length,
    }
  }, [data, activeDept])

  const handleEditFee = (dept: DepartmentFeeRow) => {
    setEditingFee(dept.classLevel)
    setFeeInput(dept.isDefault ? '' : String(dept.fee))
  }

  const handleSaveFee = async (classLevel: string) => {
    const val = feeInput.trim()
    const fee = val === '' ? null : Math.round(Number(val))
    if (val !== '' && (!Number.isFinite(fee) || fee! < 0)) {
      showToast('Enter a valid fee amount (or leave blank to use the default)', 'error')
      return
    }
    setSavingFee(true)
    try {
      await updateDepartmentFeeApi(classLevel, fee)
      await load()
      setEditingFee(null)
      showToast('Registration fee updated')
    } catch {
      showToast('Failed to update fee', 'error')
    } finally {
      setSavingFee(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg">
          <BookMarked size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">HND Registration</h1>
          <p className="text-sm text-muted-foreground">Level 2 students · HND exam registration{data?.session ? ` · ${data.session}` : ''}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total students', value: stats.total, cls: '' },
          { label: 'Paid',           value: stats.paid,    cls: 'text-emerald-600' },
          { label: 'Partial',        value: stats.partial, cls: 'text-amber-600' },
          { label: 'Not paid',       value: stats.unpaid,  cls: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-muted rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.cls || 'text-foreground'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Registration fees per department */}
      {data && data.departments.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Registration Fee per Department</h3>
          <div className="divide-y divide-border">
            {data.departments.map((dept) => (
              <div key={dept.classLevel} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex-1 text-sm font-medium text-foreground">{dept.department}</span>
                {editingFee === dept.classLevel ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="500"
                      placeholder={String(data.defaultFee)}
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      autoFocus
                      className="w-32 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">XAF</span>
                    <button
                      onClick={() => handleSaveFee(dept.classLevel)}
                      disabled={savingFee}
                      className="flex items-center gap-1 bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#d63429] disabled:opacity-50 transition">
                      <Check size={12} /> {savingFee ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingFee(null)}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground transition">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${dept.isDefault ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                      {formatXAF(dept.fee)}
                      {dept.isDefault && <span className="text-xs ml-1">(default)</span>}
                    </span>
                    <button
                      onClick={() => handleEditFee(dept)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition">
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Default: {formatXAF(data.defaultFee)}. Leave blank to use the default.
          </p>
        </div>
      )}

      {/* Department filter pills */}
      {departments.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {departments.map((dept) => (
            <button key={dept} onClick={() => { setActiveDept(dept); setSearch('') }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeDept === dept
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>
              {dept === 'ALL' ? 'All departments' : dept}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or matric…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-8 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : !data || data.students.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No Level 2 students found. Make sure Level 2 department classes exist.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No students match your search.</div>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Department</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Paid</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageItems.map((s, i) => (
                    <tr key={s.studentId} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{(page - 1) * 30 + i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.studentIdCode}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{s.department}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">{s.paid > 0 ? formatXAF(s.paid) : '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} balance={s.balance} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetailFor({ id: s.studentId, name: s.name })}
                          className="text-xs px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
            </div>
          )}
        </>
      )}

      {detailFor && (
        <HndRegistrationModal
          studentId={detailFor.id}
          studentName={detailFor.name}
          onClose={() => setDetailFor(null)}
          onChanged={load}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
