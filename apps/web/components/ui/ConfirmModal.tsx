'use client'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmColor?: 'red' | 'green' | 'blue'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen, title, message, confirmLabel = 'Confirm',
  confirmColor = 'blue', onConfirm, onCancel
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
            className="flex-1 border border-border text-muted-foreground py-2 rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${colorMap[confirmColor]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
