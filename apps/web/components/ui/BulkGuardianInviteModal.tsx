'use client'
import { useEffect, useRef, useState } from 'react'
import {
  getClassGuardianAccessApi, createBulkGuardianInvitesApi,
  ClassGuardianAccess, BulkInviteResult, BulkInviteRow,
} from '@/lib/api/parent'
import { downloadGuardianPhoneSheetApi, importGuardianPhonesApi, PhoneImportResult } from '@/lib/api/students'
import { useT } from '@/lib/i18n'
import {
  X, Loader2, AlertCircle, CheckCircle2, MessageCircle, Copy, Printer,
  Download, Upload, Phone,
} from 'lucide-react'

/**
 * Gives every guardian in one class access to the parent portal.
 *
 * What this removes is the reopening of a modal per student, NOT the tap per parent: a
 * wa.me link opens one chat at a time, and there is no way to send a WhatsApp message to
 * many numbers at once without a Meta business account. On a computer each Send opens
 * WhatsApp Web with the message already typed, so a class is a few minutes of clicking.
 *
 * A class at a time is also the honest unit. A whole school is thousands of taps, and a
 * personal number firing hundreds of identical messages in a row is how WhatsApp decides
 * an account is spam. Printed slips are the whole-school path.
 */
export default function BulkGuardianInviteModal({
  classLevel, classLabel, schoolName, onClose, onPhonesChanged,
}: {
  classLevel: string
  classLabel: string
  schoolName: string
  onClose: () => void
  onPhonesChanged?: () => void
}) {
  const t = useT()
  const [access, setAccess] = useState<ClassGuardianAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<BulkInviteResult | null>(null)
  const [copiedId, setCopiedId] = useState('')

  // Which invites this admin has already sent. Kept in the browser rather than on the
  // invite row: "have I sent this one" is a property of the person working through the
  // list, not of the school's data, and it means no schema change for a tick box. The
  // authoritative state (a parent who actually signed in) comes from the server as
  // `linked`, and is shown separately.
  const [sent, setSent] = useState<Set<string>>(new Set())

  const [phoneFile, setPhoneFile] = useState<File | null>(null)
  const [phonePreview, setPhonePreview] = useState<PhoneImportResult | null>(null)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [phoneDone, setPhoneDone] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const loadAccess = async () => {
    try {
      setAccess(await getClassGuardianAccessApi(classLevel))
    } catch {
      setError(t('Could not load parent access for this class.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccess()
    try {
      const raw = localStorage.getItem('bulletin.guardianInvitesSent')
      if (raw) setSent(new Set(JSON.parse(raw) as string[]))
    } catch { /* a corrupt entry just means nothing is ticked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classLevel])

  const markSent = (inviteId: string) => {
    setSent((prev) => {
      const next = new Set(prev)
      next.add(inviteId)
      // Capped so the list cannot grow without limit across a year of classes.
      const ids = [...next].slice(-2000)
      try { localStorage.setItem('bulletin.guardianInvitesSent', JSON.stringify(ids)) } catch { /* private mode */ }
      return new Set(ids)
    })
  }

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      setResult(await createBulkGuardianInvitesApi({ classLevel }))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Could not create the links.'))
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async (row: BulkInviteRow) => {
    await navigator.clipboard.writeText(row.link)
    setCopiedId(row.inviteId)
    setTimeout(() => setCopiedId(''), 2000)
  }

  // ── Guardian phone backfill ───────────────────────────────────────────────

  const handleDownloadSheet = async () => {
    setPhoneError('')
    try {
      const blob = await downloadGuardianPhoneSheetApi(classLevel)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `guardian-phones-${classLabel.replace(/[^a-z0-9]+/gi, '-')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setPhoneError(t('Could not download the list.'))
    }
  }

  const handlePhoneFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoneFile(file)
    setPhonePreview(null)
    setPhoneError('')
    setPhoneDone('')
    setPhoneBusy(true)
    try {
      setPhonePreview(await importGuardianPhonesApi(file, false))
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setPhoneError(e2.response?.data?.message || t('Could not read that file.'))
    } finally {
      setPhoneBusy(false)
    }
  }

  const handlePhoneApply = async () => {
    if (!phoneFile) return
    setPhoneBusy(true)
    setPhoneError('')
    try {
      const applied = await importGuardianPhonesApi(phoneFile, true)
      setPhoneDone(`${applied.applied} ${applied.applied === 1 ? t('number saved') : t('numbers saved')}`)
      setPhonePreview(null)
      setPhoneFile(null)
      if (fileInput.current) fileInput.current.value = ''
      await loadAccess()
      onPhonesChanged?.()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setPhoneError(e2.response?.data?.message || t('Could not save those numbers.'))
    } finally {
      setPhoneBusy(false)
    }
  }

  // ── Printed slips ─────────────────────────────────────────────────────────

  const printSlips = () => {
    if (!result || result.invites.length === 0) return
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) return
    const expiry = new Date(result.expiresAt).toLocaleDateString()
    // Self-contained: the popup has no access to the app's stylesheet. Two slips per page,
    // cut along the dashed line, which is how a school actually hands these out.
    // Four to a page. A slip is six short lines, and at two per page a class of forty costs
    // twenty sheets of paper with half of each one blank.
    const slips = result.invites.map((r) => `
      <div class="slip">
        <h1>${escapeHtml(schoolName)}</h1>
        <p class="who">Parent access for <strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.className)})</p>
        <p>Open this address in a web browser to set your password, then see report cards and school fees.</p>
        <div class="link">${escapeHtml(r.link)}</div>
        <p>You will sign in afterwards with this phone number: <strong>${escapeHtml(r.phoneDisplay)}</strong></p>
        <p class="note">This link works once and is only for you. Please do not share it. It stops working on ${expiry}.</p>
      </div>`).join('')
    w.document.write(`
      <html><head><title>Parent access slips - ${escapeHtml(classLabel)}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #111; margin: 0; padding: 0; }
        .slip { padding: 16px 26px; border-bottom: 1px dashed #999; height: 24.5vh; box-sizing: border-box; }
        .slip:nth-child(4n) { border-bottom: none; page-break-after: always; }
        h1 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; }
        p { font-size: 12px; line-height: 1.45; margin: 4px 0; }
        .who { font-size: 14px; }
        .link { font-family: monospace; font-size: 11px; word-break: break-all;
                border: 1px solid #ccc; padding: 7px; border-radius: 6px; margin: 7px 0; }
        .note { font-size: 10px; color: #666; }
      </style></head><body>${slips}</body></html>`)
    w.document.close()
    w.print()
  }

  const counts = access?.counts
  const sentCount = result ? result.invites.filter((r) => sent.has(r.inviteId)).length : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h3 className="font-semibold text-foreground text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
              {t('Parent access')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{classLabel}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={22} /></div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              {!result ? (
                <>
                  {/* Where the class stands before anything is created */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <Stat label={t('Ready to invite')} value={counts?.ready ?? 0} tone="primary" />
                    <Stat label={t('Parent has access')} value={counts?.linked ?? 0} tone="emerald" />
                    <Stat label={t('No phone number')} value={counts?.noPhone ?? 0} tone="amber" />
                  </div>

                  {(counts?.noPhone ?? 0) > 0 && (
                    <div className="border border-border rounded-xl p-4 mb-5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                        <Phone size={14} className="text-amber-600" />
                        {counts?.noPhone} {counts?.noPhone === 1 ? t('student has no usable phone number') : t('students have no usable phone number')}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        {t('The login link is sent to the guardian\'s phone, so those students cannot be invited yet. Download the list, fill in the phone column, then upload it back.')}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={handleDownloadSheet}
                          className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm hover:bg-hover transition">
                          <Download size={15} /> {t('Download the list')}
                        </button>
                        <button onClick={() => fileInput.current?.click()} disabled={phoneBusy}
                          className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm hover:bg-hover disabled:opacity-50 transition">
                          {phoneBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                          {t('Upload the filled list')}
                        </button>
                        <input ref={fileInput} type="file" accept=".xlsx,.csv" onChange={handlePhoneFile} className="hidden" />
                      </div>

                      {phoneError && (
                        <p className="mt-3 text-xs text-destructive">{phoneError}</p>
                      )}
                      {phoneDone && (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 size={13} /> {phoneDone}
                        </p>
                      )}

                      {phonePreview && (
                        <div className="mt-3 border-t border-border pt-3">
                          <p className="text-sm text-foreground">
                            <strong>{phonePreview.changes.length}</strong> {t('numbers will be saved')}
                            {phonePreview.unchanged > 0 && <>, {phonePreview.unchanged} {t('already correct')}</>}
                            {phonePreview.errors.length > 0 && <>, <span className="text-destructive">{phonePreview.errors.length} {t('with a problem')}</span></>}
                          </p>
                          {phonePreview.errors.length > 0 && (
                            <ul className="mt-2 max-h-28 overflow-y-auto text-xs text-muted-foreground space-y-1">
                              {phonePreview.errors.slice(0, 30).map((e) => (
                                <li key={e.row}>{t('Row')} {e.row}: {e.reason}</li>
                              ))}
                            </ul>
                          )}
                          <button onClick={handlePhoneApply} disabled={phoneBusy || phonePreview.changes.length === 0}
                            className="mt-3 bg-primary text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-40 transition">
                            {phoneBusy ? t('Saving...') : `${t('Save')} ${phonePreview.changes.length} ${t('numbers')}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={handleCreate} disabled={creating || (counts?.ready ?? 0) === 0}
                    className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-40 disabled:cursor-not-allowed transition">
                    {creating
                      ? t('Creating...')
                      : (counts?.ready ?? 0) === 0
                        ? t('Nobody in this class can be invited yet')
                        : `${t('Create login links for')} ${counts?.ready} ${counts?.ready === 1 ? t('parent') : t('parents')}`}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground text-center leading-relaxed">
                    {t('Nothing is sent automatically. You send each one from your own WhatsApp, or print the slips.')}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">{sentCount}</strong> {t('of')} {result.invites.length} {t('sent')}
                    </p>
                    <button onClick={printSlips}
                      className="flex items-center gap-2 border border-border text-foreground px-3 py-1.5 rounded-lg text-sm hover:bg-hover transition">
                      <Printer size={15} /> {t('Print all slips')}
                    </button>
                  </div>

                  <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {result.invites.map((r) => {
                      const done = sent.has(r.inviteId)
                      return (
                        <div key={r.inviteId} className={`flex items-center gap-3 px-3 py-2.5 ${done ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{r.phoneDisplay}</p>
                          </div>
                          {done && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
                          <button onClick={() => copyLink(r)} title={t('Copy link')}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-hover transition shrink-0">
                            <Copy size={14} />
                          </button>
                          <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer"
                            onClick={() => markSent(r.inviteId)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                              done
                                ? 'border border-border text-muted-foreground hover:bg-hover'
                                : 'bg-[#25D366] text-white hover:brightness-95'}`}>
                            <MessageCircle size={13} /> {done ? t('Send again') : t('Send')}
                          </a>
                          {copiedId === r.inviteId && <span className="text-[11px] text-emerald-600 shrink-0">{t('Copied')}</span>}
                        </div>
                      )
                    })}
                  </div>

                  {result.skipped.length > 0 && (
                    <details className="mt-4">
                      <summary className="text-sm text-muted-foreground cursor-pointer">
                        {result.skipped.length} {result.skipped.length === 1 ? t('student was skipped') : t('students were skipped')}
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {result.skipped.map((s) => (
                          <li key={s.studentId}><span className="text-foreground">{s.name}</span>: {s.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <p className="mt-4 text-[11px] text-muted-foreground text-center leading-relaxed">
                    {t('Each link is shown only once and works only once. Close this and the links are gone, so print the slips if you are not sending them now.')}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'emerald' | 'amber' }) {
  const toneCls = tone === 'primary' ? 'text-primary' : tone === 'emerald' ? 'text-emerald-600' : 'text-amber-600'
  return (
    <div className="border border-border rounded-xl p-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
  )
}

/** The slips are written into a popup with innerHTML, so a name with an "&" or a quote in
 *  it has to survive as text rather than becoming markup. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
