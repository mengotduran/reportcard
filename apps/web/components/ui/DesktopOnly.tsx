import { Monitor } from 'lucide-react'

/**
 * Renders `children` only on md+ screens. On smaller screens it shows a
 * centered notice asking the user to switch to a larger device.
 * Used for pages that need the space/precision of a desktop (Card Designer,
 * Report Cards, Settings).
 */
export default function DesktopOnly({
  children,
  title = 'Open this on a larger screen',
  message = 'This page needs the space and precision of a bigger display. Please use a laptop or desktop computer.',
}: {
  children: React.ReactNode
  title?: string
  message?: string
}) {
  return (
    <>
      {/* Mobile notice */}
      <div className="md:hidden flex flex-col items-center justify-center text-center min-h-[60vh] px-6">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <Monitor size={26} className="text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">{message}</p>
      </div>

      {/* Desktop / tablet content */}
      <div className="hidden md:block">{children}</div>
    </>
  )
}
