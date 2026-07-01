'use client'
import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { ClassReadiness } from '@/lib/api/reportcards'

export interface ClassOption { classLevel: string; readiness?: ClassReadiness }

/**
 * Pick one OR several classes for an action (bulk publish / class list / print).
 * When `showReadiness` is on, each class keeps its publish-readiness check and
 * un-ready classes can't be selected.
 */
export default function ClassPickerModal({
  open, title, subtitle, options, showReadiness = false, confirmLabel, busy = false, onClose, onConfirm,
}: {
  open: boolean
  title: string
  subtitle?: string
  options: ClassOption[]
  showReadiness?: boolean
  confirmLabel: string
  busy?: boolean
  onClose: () => void
  onConfirm: (selected: string[]) => void
}) {
  const t = useT()
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => { if (open) setSelected([]) }, [open])

  if (!open) return null

  const isReady = (o: ClassOption) => !showReadiness || !o.readiness || o.readiness.ready
  const selectable = options.filter(isReady).map((o) => o.classLevel)
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.includes(c))

  const toggle = (cl: string) =>
    setSelected((prev) => (prev.includes(cl) ? prev.filter((c) => c !== cl) : [...prev, cl]))
  const toggleAll = () => setSelected(allSelected ? [] : selectable)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-bold text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 -mr-1"><X size={18} /></button>
        </div>

        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <button onClick={toggleAll} disabled={selectable.length === 0}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-40">
            {allSelected ? t('Clear all') : t('Select all')}
          </button>
          <span className="text-xs text-muted-foreground">{selected.length} {t('selected')}</span>
        </div>

        <div className="overflow-y-auto p-2 flex-1">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('No classes available.')}</p>
          ) : options.map((o) => {
            const ready = isReady(o)
            const r = o.readiness
            const checked = selected.includes(o.classLevel)
            return (
              <button key={o.classLevel} onClick={() => ready && toggle(o.classLevel)} disabled={!ready}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition disabled:cursor-not-allowed ${ready ? 'hover:bg-muted' : 'opacity-60'}`}>
                <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary border-primary' : 'border-border'} ${!ready ? 'opacity-50' : ''}`}>
                  {checked && <Check size={12} className="text-white" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {showReadiness && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-green-500' : 'bg-destructive'}`} />}
                    <p className="font-medium text-foreground text-sm">{o.classLevel}</p>
                  </div>
                  {showReadiness && r && !r.ready && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.noSubjects && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">{t('No subjects assigned')}</span>}
                      {r.missingSeqs > 0 && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">{r.missingSeqs} {t('missing seqs')}</span>}
                      {r.missingRemarks > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{r.missingRemarks} {t('no remarks')}</span>}
                      {!r.noSubjects && (r.total ?? 0) === 0 && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{t('Nothing to publish')}</span>}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition">{t('Cancel')}</button>
          <button onClick={() => onConfirm(selected)} disabled={selected.length === 0 || busy}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-[#d63429] disabled:opacity-50 transition">
            {busy ? t('Working…') : `${confirmLabel} (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
