'use client'
import { useEffect, useState } from 'react'
import {
  getGuardianRequestsApi, approveGuardianRequestApi, rejectGuardianRequestApi,
  GuardianRequest, ApproveResult,
} from '@/lib/api/parent'
import { useT } from '@/lib/i18n'
import {
  X, Loader2, AlertCircle, CheckCircle2, MessageCircle, Mail, Phone, ShieldCheck, UserX,
} from 'lucide-react'

/**
 * Parents who asked for access on the public sign-up form, waiting on the school.
 *
 * Everything reaching this queue needs a human, by definition: a request whose email already
 * matched the student's record was delivered automatically and never appears here. What is
 * left is a parent whose contact the school holds nothing to compare against (the common
 * case, since guardian contacts only became required recently), or one whose child could not
 * be identified from the name they typed.
 *
 * Approving is therefore an act of recognition, not a rubber stamp: the admin is saying they
 * know this family. It also fills the student's empty contact column, which is why this is
 * worth more than a queue of chores.
 */
export default function GuardianRequestsModal({
  onClose, onResolved,
}: { onClose: () => void; onResolved?: () => void }) {
  const t = useT()
  const [requests, setRequests] = useState<GuardianRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showAll, setShowAll] = useState(false)
  // A phone request cannot be delivered by the server, so approving hands the link back for
  // the admin to send from their own WhatsApp. Kept per request so several can be worked
  // through without the earlier ones disappearing.
  const [ready, setReady] = useState<Record<string, ApproveResult>>({})

  const load = async (all: boolean) => {
    setLoading(true)
    try {
      const res = await getGuardianRequestsApi(all ? 'ALL' : 'PENDING')
      setRequests(res.requests)
    } catch {
      setError(t('Could not load parent requests.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(showAll) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showAll])

  const approve = async (r: GuardianRequest) => {
    setBusyId(r.id)
    setError('')
    try {
      const result = await approveGuardianRequestApi(r.id, r.student?.id)
      setReady((prev) => ({ ...prev, [r.id]: result }))
      setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'SENT' } : x)))
      onResolved?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Could not approve that request.'))
    } finally {
      setBusyId('')
    }
  }

  const reject = async (r: GuardianRequest) => {
    setBusyId(r.id)
    setError('')
    try {
      await rejectGuardianRequestApi(r.id)
      setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: 'REJECTED' } : x)))
      onResolved?.()
    } catch {
      setError(t('Could not dismiss that request.'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <h3 className="font-semibold text-foreground text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
              {t('Parent requests')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('Parents who asked for access to their child on the sign-up page.')}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={22} /></div>
          ) : requests.length === 0 ? (
            <div className="border border-border rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {showAll ? t('No parent has used the sign-up page yet.') : t('Nothing waiting. Every request has been dealt with.')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => {
                const result = ready[r.id]
                const settled = r.status !== 'PENDING'
                return (
                  <div key={r.id} className="border border-border rounded-xl p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{r.parentName || t('Someone')}</span>
                          {' '}{t('says they are the parent of')}{' '}
                          <span className="font-semibold">{r.studentName}</span>
                          {' '}<span className="text-muted-foreground">({r.classLevel})</span>
                        </p>

                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {r.email ? <Mail size={12} /> : <Phone size={12} />}
                            {r.email ?? r.phoneDisplay}
                          </span>
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                          {r.matched && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <ShieldCheck size={12} /> {t('Matches our record')}
                            </span>
                          )}
                        </p>

                        {/* The two things that decide what the admin should do. Dropped once
                            the request is settled: telling somebody to be careful about a
                            decision they already made only makes the list harder to read. */}
                        {!settled && !r.resolvable && (
                          <p className="mt-2 text-xs text-amber-600 leading-relaxed">
                            {t('No active student of that name is in that class. Check the spelling with the parent before approving.')}
                          </p>
                        )}
                        {!settled && r.resolvable && !r.matched && (
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {t('We hold no matching contact for this student, so nothing here proves the relationship. Approve only if you know this family. Approving also saves this contact on the student\'s record.')}
                          </p>
                        )}
                      </div>

                      {!settled && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => reject(r)} disabled={busyId === r.id}
                            title={t('Dismiss')}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 transition">
                            <UserX size={15} />
                          </button>
                          <button onClick={() => approve(r)} disabled={busyId === r.id || !r.resolvable}
                            className="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d63429] disabled:opacity-40 disabled:cursor-not-allowed transition">
                            {busyId === r.id ? t('Working...') : t('Approve')}
                          </button>
                        </div>
                      )}

                      {settled && !result && (
                        <span className={`text-xs font-medium shrink-0 ${r.status === 'SENT' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {r.status === 'SENT' ? t('Sent') : t('Dismissed')}
                        </span>
                      )}
                    </div>

                    {/* Approved: an email is already gone, a phone needs the admin to tap */}
                    {result && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {result.sent === 'email' ? (
                          <p className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 size={13} /> {result.message}
                          </p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground flex-1">
                              {t('Send this to')} {result.phoneDisplay}. {t('It works once.')}
                            </p>
                            <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:brightness-95 transition shrink-0">
                              <MessageCircle size={13} /> {t('Send on WhatsApp')}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={() => setShowAll((v) => !v)}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground transition">
            {showAll ? t('Show only what is waiting') : t('Show requests already dealt with')}
          </button>
        </div>
      </div>
    </div>
  )
}
