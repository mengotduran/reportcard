'use client'
import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmColor?: 'red' | 'green' | 'blue'
  onConfirm: () => void
  onCancel: () => void
  /** True while onConfirm's request is in flight. Disables the confirm button and
   *  swaps its label, so a second click can't fire a second request — a double
   *  DELETE, say, whose second leg 404s on an already-gone row and overwrites the
   *  first leg's success toast with a spurious error. */
  confirming?: boolean
  /** Label shown while `confirming` is true. */
  confirmingLabel?: string
  /** When set, the confirm button stays disabled until the user types this exact
   *  string. For irreversible, unrecoverable actions only: deleting a school takes
   *  its students, report cards and marks with it, and nothing here is soft-deleted.
   *  A plain yes/no modal is dismissed by reflex; retyping the name cannot be, and it
   *  also forces the reader to check WHICH row they are on, which is the mistake that
   *  actually happens when a delete icon sits beside everyday buttons. */
  confirmPhrase?: string
  /** Set when the action is not allowed at all. The confirm button goes dead, the
   *  confirmPhrase box is hidden (there is nothing to type your way past), and this text
   *  is shown as the reason. For rules the server owns: the caller should ask the server
   *  first and pass its answer through, so the greyed-out button and the eventual refusal
   *  can never disagree. Cancel becomes the only way out, so it is relabelled Close. */
  blockedReason?: string
  /** True while the caller is still asking the server whether the action is allowed.
   *  Holds the confirm button closed rather than letting it flash enabled and then go
   *  dead, which reads as the dialog changing its mind. */
  checking?: boolean
}

export default function ConfirmModal({
  isOpen, title, message, confirmLabel = 'Confirm',
  confirmColor = 'blue', onConfirm, onCancel, confirming = false, confirmingLabel = 'Working...',
  confirmPhrase, blockedReason, checking = false,
}: ConfirmModalProps) {
  useBodyScrollLock(isOpen)
  const [typed, setTyped] = useState('')

  // Clear between openings. Without this the previous school's name is still sitting
  // in the box when the modal reopens, so the next delete would be one click again —
  // and worse, it could be pre-satisfied for a DIFFERENT school than the one typed.
  useEffect(() => { setTyped('') }, [isOpen, confirmPhrase])

  if (!isOpen) return null

  const phraseSatisfied = !confirmPhrase || typed.trim() === confirmPhrase
  // While blocked there is nothing to type, so the phrase box is not shown and its check
  // is skipped entirely — it would otherwise be an unsatisfiable condition on a button
  // that is already dead for a different, explained reason.
  const isBlocked = !!blockedReason
  const blocked = confirming || checking || isBlocked || (!isBlocked && !phraseSatisfied)

  const colorMap = {
    red:   'bg-destructive hover:bg-destructive/90 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
    blue:  'bg-primary hover:bg-[#d63429] text-primary-foreground',
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-foreground text-[15px] mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm mb-6">{message}</p>

        {isBlocked && (
          <div className="mb-6 flex gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive leading-relaxed">{blockedReason}</p>
          </div>
        )}

        {checking && (
          <p className="mb-6 text-sm text-muted-foreground">Checking...</p>
        )}

        {confirmPhrase && !isBlocked && !checking && (
          <div className="mb-6">
            <label className="block text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-semibold text-foreground break-all">{confirmPhrase}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={confirming}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={confirmPhrase}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 border border-border text-muted-foreground py-2 rounded-lg text-sm hover:bg-hover transition-colors disabled:opacity-50"
          >
            {/* Nothing is being cancelled when the action was never available. */}
            {isBlocked ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorMap[confirmColor]}`}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
