'use client'

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
}

export default function ConfirmModal({
  isOpen, title, message, confirmLabel = 'Confirm',
  confirmColor = 'blue', onConfirm, onCancel, confirming = false, confirmingLabel = 'Working...'
}: ConfirmModalProps) {
  if (!isOpen) return null

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
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 border border-border text-muted-foreground py-2 rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${colorMap[confirmColor]}`}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
