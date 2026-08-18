'use client'
import { useEffect, useState } from 'react'
import {
  getGuardianStatusApi, createGuardianInviteApi,
  GuardianStatus, GuardianInvite,
} from '@/lib/api/parent'
import { X, Loader2, AlertCircle, CheckCircle2, MessageCircle, Copy, Printer } from 'lucide-react'

/**
 * Gives a student's guardian access to the parent portal.
 *
 * Delivery is deliberately manual: the WhatsApp button opens the ADMIN's own WhatsApp with
 * the message pre-typed and addressed to the guardian, and the admin presses send. No
 * messaging gateway, no per-message cost, no business verification. The printable slip is
 * the fallback for a guardian who cannot be reached on WhatsApp at all.
 */
export default function GuardianInviteModal({
  studentId, studentName, onClose,
}: { studentId: string; studentName: string; onClose: () => void }) {
  const [status, setStatus] = useState<GuardianStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<GuardianInvite | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getGuardianStatusApi(studentId)
      .then(setStatus)
      .catch(() => setError('Could not check this student’s parent access.'))
      .finally(() => setLoading(false))
  }, [studentId])

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      setInvite(await createGuardianInviteApi(studentId))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Could not create the link.')
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    if (!invite) return
    await navigator.clipboard.writeText(invite.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const printSlip = () => {
    if (!invite) return
    const w = window.open('', '_blank', 'width=600,height=700')
    if (!w) return
    // Self-contained document: the popup has no access to the app's stylesheet.
    w.document.write(`
      <html><head><title>Parent access - ${studentName}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        p { font-size: 13px; line-height: 1.6; }
        .link { font-family: monospace; font-size: 12px; word-break: break-all;
                border: 1px solid #ccc; padding: 10px; border-radius: 6px; margin: 14px 0; }
        .note { font-size: 11px; color: #666; margin-top: 20px; }
      </style></head><body>
      <h1>Parent access for ${studentName}</h1>
      <p>Open this address in a web browser to set your password and see report cards and school fees.</p>
      <div class="link">${invite.link}</div>
      <p>You will sign in afterwards with your phone number: <strong>${invite.phoneDisplay}</strong></p>
      <p class="note">This link works once and is only for you. Please do not share it.
      It stops working on ${new Date(invite.expiresAt).toLocaleDateString()}.</p>
      </body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground text-lg" style={{ fontFamily: 'var(--font-serif)' }}>Parent access</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{studentName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={22} /></div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}

            {/* Already linked */}
            {status?.linked && !invite && (
              <div className="flex items-start gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-lg px-3 py-2.5 mb-4">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{status.linked.name}</strong> already has access, using {status.linked.phone}.
                </span>
              </div>
            )}

            {/* No usable phone: the button is greyed with the reason, rather than failing on click */}
            {status && !status.canInvite && (
              <div className="text-sm text-muted-foreground bg-hover rounded-lg px-3 py-2.5 mb-4">
                This student has no usable guardian phone yet. Add one on their record first, then come back.
                {status.phoneProblem && <span className="block mt-1 text-xs">{status.phoneProblem}</span>}
              </div>
            )}

            {status?.pendingInvite && !invite && (
              <p className="text-xs text-muted-foreground mb-4">
                A link was already sent on {new Date(status.pendingInvite.createdAt).toLocaleDateString()} and has not been
                used yet. Creating a new one replaces it.
              </p>
            )}

            {!invite ? (
              <button onClick={handleCreate} disabled={creating || !status?.canInvite}
                className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-40 disabled:cursor-not-allowed transition">
                {creating ? 'Creating...' : status?.linked ? 'Create another link' : 'Create login link'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Send this to the guardian on {invite.phoneDisplay}. It works once.
                </p>

                <a href={invite.whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-2.5 rounded-lg text-sm font-medium hover:brightness-95 transition">
                  <MessageCircle size={16} /> Send on WhatsApp
                </a>

                <div className="flex gap-2">
                  <button onClick={copyLink}
                    className="flex-1 flex items-center justify-center gap-2 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition">
                    <Copy size={15} /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button onClick={printSlip}
                    className="flex-1 flex items-center justify-center gap-2 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition">
                    <Printer size={15} /> Print slip
                  </button>
                </div>

                <p className="text-[11px] text-muted-foreground text-center">
                  The link is shown only once. If it is lost, create another.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
